// 의존성 없는 Node 서버: Notion을 읽어 다이어리 UI에 JSON으로 내려준다
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient, blocksToHtml, pageToEntry } from './notion.js';
import { demoEntries, demoContent } from './demo.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv(path.join(__dirname, '.env'));

const PORT = Number(process.env.PORT) || 3000;
const TZ = process.env.TZ_NAME || 'Asia/Seoul';
const DB_ID = (process.env.NOTION_DATABASE_ID || '').trim();
const DEMO = process.env.DEMO === '1' || !process.env.NOTION_TOKEN;
const notion = DEMO ? null : createClient(process.env.NOTION_TOKEN);

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

// 짧은 메모리 캐시로 Notion API 호출(초당 3회 제한)을 아낀다
const cache = new Map();
async function cached(key, ttlMs, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  return value;
}

// 데이터베이스 스키마에서 제목/날짜 속성 이름을 찾는다
async function getSchema() {
  return cached('schema', 5 * 60_000, async () => {
    const db = await notion.call(`/databases/${DB_ID}`);
    const entries = Object.entries(db.properties);
    return {
      title: entries.find(([, p]) => p.type === 'title')?.[0],
      date: entries.find(([, p]) => p.type === 'date')?.[0],
      name: db.title?.map((t) => t.plain_text).join('') || '일기장',
    };
  });
}

function monthRange(month) {
  const [y, m] = month.split('-').map(Number);
  const pad = (n) => String(n).padStart(2, '0');
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`;
  return { start: `${month}-01`, end: next };
}

function shiftDay(ymd, days) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function listEntries(month) {
  if (DEMO) return demoEntries(month);
  const { start, end } = monthRange(month);
  let pages;
  let dateProp;

  if (DB_ID) {
    const schema = await getSchema();
    dateProp = schema.date;
    // 날짜 속성이 없으면 생성일로 필터. 시간대 차이를 고려해 하루씩 여유를 둔다.
    const filter = dateProp
      ? { and: [{ property: dateProp, date: { on_or_after: start } }, { property: dateProp, date: { before: end } }] }
      : { and: [
          { timestamp: 'created_time', created_time: { on_or_after: shiftDay(start, -1) } },
          { timestamp: 'created_time', created_time: { before: shiftDay(end, 1) } },
        ] };
    const sorts = [dateProp ? { property: dateProp, direction: 'descending' } : { timestamp: 'created_time', direction: 'descending' }];
    pages = await notion.paginate(`/databases/${DB_ID}/query`, { body: { filter, sorts } });
  } else {
    // DB 미지정: 통합에 공유된 모든 페이지를 검색해 생성일 기준으로 묶는다
    pages = await cached('search', 60_000, () => notion.paginate('/search', {
      body: { filter: { property: 'object', value: 'page' }, sort: { timestamp: 'last_edited_time', direction: 'descending' } },
    }));
    pages = pages.filter((p) => !p.archived && !p.in_trash);
  }

  return pages
    .map((p) => pageToEntry(p, { dateProp, tz: TZ }))
    .filter((e) => e.date >= start && e.date < end)
    .sort((a, b) => b.date.localeCompare(a.date));
}

// 자식 블록을 재귀적으로 불러온다 (토글·리스트 안의 내용 포함, 깊이 3까지)
async function fetchBlocks(id, depth = 0) {
  const blocks = await notion.paginate(`/blocks/${id}/children`, { method: 'GET' });
  if (depth < 3) {
    for (const b of blocks) {
      if (b.has_children && b.type !== 'child_page' && b.type !== 'child_database') {
        b.children = await fetchBlocks(b.id, depth + 1);
      }
    }
  }
  return blocks;
}

async function getEntry(id) {
  if (DEMO) return demoContent(id);
  return cached(`entry:${id}`, 30_000, async () => {
    const page = await notion.call(`/pages/${id}`);
    const schema = DB_ID ? await getSchema() : {};
    const entry = pageToEntry(page, { dateProp: schema.date, tz: TZ });
    entry.html = blocksToHtml(await fetchBlocks(id));
    return entry;
  });
}

async function createEntry({ title, date, content, icon }) {
  if (DEMO) throw Object.assign(new Error('데모 모드에서는 저장할 수 없어요. .env에 NOTION_TOKEN을 설정하세요.'), { status: 400 });
  if (!DB_ID) throw Object.assign(new Error('새 일기를 쓰려면 NOTION_DATABASE_ID가 필요해요.'), { status: 400 });
  const schema = await getSchema();
  const properties = { [schema.title]: { title: [{ text: { content: title || date } }] } };
  if (schema.date) properties[schema.date] = { date: { start: date } };
  // Notion rich_text 한 덩어리는 2000자 제한이 있어 문단 단위로 나눈다
  const children = String(content || '').split(/\n/).map((line) => ({
    object: 'block',
    type: 'paragraph',
    paragraph: { rich_text: line ? [{ type: 'text', text: { content: line.slice(0, 2000) } }] : [] },
  })).slice(0, 100);
  const page = await notion.call('/pages', {
    method: 'POST',
    body: { parent: { database_id: DB_ID }, properties, children, ...(icon ? { icon: { type: 'emoji', emoji: icon } } : {}) },
  });
  cache.clear();
  return pageToEntry(page, { dateProp: schema.date, tz: TZ });
}

// ---------- HTTP ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf' };

function send(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(e); } });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname === '/api/info') {
      const name = DEMO ? '데모 일기장' : DB_ID ? (await getSchema()).name : '나의 노션';
      return send(res, 200, { demo: DEMO, canWrite: !DEMO && !!DB_ID, name });
    }
    if (url.pathname === '/api/entries' && req.method === 'GET') {
      const month = url.searchParams.get('month');
      if (!/^\d{4}-\d{2}$/.test(month || '')) return send(res, 400, { error: 'month=YYYY-MM 형식이 필요해요' });
      return send(res, 200, await listEntries(month));
    }
    if (url.pathname === '/api/entries' && req.method === 'POST') {
      const body = await readBody(req);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date || '')) return send(res, 400, { error: '날짜가 필요해요' });
      return send(res, 201, await createEntry(body));
    }
    const m = url.pathname.match(/^\/api\/entries\/([0-9a-f-]{32,36})$/i);
    if (m) return send(res, 200, await getEntry(m[1]));

    // 정적 파일
    const file = path.join(__dirname, 'public', url.pathname === '/' ? 'index.html' : path.normalize(url.pathname));
    if (!file.startsWith(path.join(__dirname, 'public')) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      return send(res, 404, { error: 'Not found' });
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  } catch (err) {
    console.error(err);
    send(res, err.status && err.status < 500 ? err.status : 500, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`📔 Notion Diary → http://localhost:${PORT}`);
  if (DEMO) console.log('   (데모 모드: .env에 NOTION_TOKEN을 넣으면 내 노션과 연동됩니다)');
  else console.log(`   모드: ${DB_ID ? `데이터베이스 ${DB_ID}` : '공유된 모든 페이지'}`);
});
