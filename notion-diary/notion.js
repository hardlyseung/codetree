// Notion API 클라이언트와 블록 → HTML 변환기
const API = 'https://api.notion.com/v1';
const VERSION = '2022-06-28';

export function createClient(token) {
  async function call(path, { method = 'GET', body } = {}) {
    const res = await fetch(API + path, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': VERSION,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    if (!res.ok) {
      const err = new Error(data.message || `Notion API ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  // has_more/next_cursor 를 따라가며 결과를 모두 모은다
  async function paginate(path, { method = 'POST', body = {}, limit = 500 } = {}) {
    const out = [];
    let cursor;
    do {
      const page = method === 'GET'
        ? await call(`${path}${path.includes('?') ? '&' : '?'}page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`)
        : await call(path, { method, body: { ...body, page_size: 100, start_cursor: cursor } });
      out.push(...page.results);
      cursor = page.has_more ? page.next_cursor : undefined;
    } while (cursor && out.length < limit);
    return out;
  }

  return { call, paginate };
}

export function escapeHtml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function safeUrl(url = '') {
  return /^(https?:|mailto:)/i.test(url) ? url : '#';
}

export function plainText(richText = []) {
  return richText.map((t) => t.plain_text).join('');
}

export function richTextToHtml(richText = []) {
  return richText.map((t) => {
    let html = escapeHtml(t.plain_text).replace(/\n/g, '<br>');
    const a = t.annotations || {};
    if (a.code) html = `<code>${html}</code>`;
    if (a.bold) html = `<strong>${html}</strong>`;
    if (a.italic) html = `<em>${html}</em>`;
    if (a.strikethrough) html = `<s>${html}</s>`;
    if (a.underline) html = `<u>${html}</u>`;
    if (a.color && a.color !== 'default') html = `<span class="c-${a.color}">${html}</span>`;
    if (t.href) html = `<a href="${escapeHtml(safeUrl(t.href))}" target="_blank" rel="noopener">${html}</a>`;
    return html;
  }).join('');
}

function fileUrl(f) {
  return f?.type === 'external' ? f.external.url : f?.file?.url;
}

// 블록 배열을 HTML로. 연속된 리스트 항목은 하나의 <ul>/<ol>로 묶는다.
export function blocksToHtml(blocks = []) {
  let html = '';
  let list = null;
  const closeList = () => { if (list) { html += `</${list}>`; list = null; } };

  for (const b of blocks) {
    const v = b[b.type] || {};
    const text = richTextToHtml(v.rich_text);
    const kids = b.children ? blocksToHtml(b.children) : '';
    const listTag = b.type === 'bulleted_list_item' ? 'ul' : b.type === 'numbered_list_item' ? 'ol' : null;
    if (listTag !== list) closeList();
    if (listTag && !list) { html += `<${listTag}>`; list = listTag; }

    switch (b.type) {
      case 'paragraph': html += `<p>${text || '&nbsp;'}</p>${kids}`; break;
      case 'heading_1': html += `<h2>${text}</h2>${kids}`; break;
      case 'heading_2': html += `<h3>${text}</h3>${kids}`; break;
      case 'heading_3': html += `<h4>${text}</h4>${kids}`; break;
      case 'bulleted_list_item':
      case 'numbered_list_item': html += `<li>${text}${kids}</li>`; break;
      case 'to_do':
        html += `<div class="todo${v.checked ? ' done' : ''}"><span class="box">${v.checked ? '✔' : ''}</span><span>${text}</span></div>${kids}`;
        break;
      case 'quote': html += `<blockquote>${text}${kids}</blockquote>`; break;
      case 'callout': {
        const icon = v.icon?.type === 'emoji' ? escapeHtml(v.icon.emoji) : '💡';
        html += `<div class="callout"><span class="icon">${icon}</span><div>${text}${kids}</div></div>`;
        break;
      }
      case 'toggle': html += `<details><summary>${text}</summary>${kids}</details>`; break;
      case 'divider': html += '<hr>'; break;
      case 'code': html += `<pre><code>${escapeHtml(plainText(v.rich_text))}</code></pre>`; break;
      case 'image': {
        const cap = richTextToHtml(v.caption);
        html += `<figure><img src="${escapeHtml(safeUrl(fileUrl(v)))}" alt="" loading="lazy">${cap ? `<figcaption>${cap}</figcaption>` : ''}</figure>`;
        break;
      }
      case 'bookmark':
      case 'embed':
      case 'link_preview': {
        const url = v.url || '';
        html += `<p><a href="${escapeHtml(safeUrl(url))}" target="_blank" rel="noopener">🔗 ${escapeHtml(url)}</a></p>`;
        break;
      }
      case 'column_list':
      case 'column':
      case 'synced_block': html += kids; break;
      case 'child_page': html += `<p class="muted">📄 ${escapeHtml(v.title)}</p>`; break;
      default: if (text) html += `<p>${text}</p>`; break;
    }
  }
  closeList();
  return html;
}

// 페이지 객체에서 제목/날짜/아이콘 등 일기 메타데이터를 추출
export function pageToEntry(page, { dateProp, tz = 'Asia/Seoul' } = {}) {
  const props = page.properties || {};
  const titleProp = Object.values(props).find((p) => p.type === 'title');
  const dateValue = dateProp && props[dateProp]?.date?.start;
  const date = dateValue ? dateValue.slice(0, 10) : toLocalDate(page.created_time, tz);
  const tags = Object.values(props)
    .flatMap((p) => (p.type === 'multi_select' ? p.multi_select : p.type === 'select' && p.select ? [p.select] : []))
    .map((o) => o.name);
  return {
    id: page.id,
    title: plainText(titleProp?.title) || '제목 없음',
    date,
    icon: page.icon?.type === 'emoji' ? page.icon.emoji : null,
    cover: fileUrl(page.cover) || null,
    tags,
    url: page.url,
    edited: page.last_edited_time,
  };
}

export function toLocalDate(iso, tz) {
  // en-CA 로케일은 YYYY-MM-DD 형식으로 출력된다
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}
