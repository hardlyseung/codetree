// NOTION_TOKEN 없이도 화면을 확인할 수 있도록 하는 샘플 데이터
const samples = [
  { icon: '☀️', title: '오랜만에 맑은 날', tags: ['일상'], body: '<p>아침에 창문을 여니 공기가 차가웠다. 가을이 확실히 왔다.</p><ul><li>산책 30분</li><li>도서관에서 책 두 권 빌림</li></ul><blockquote>작은 일에도 감사하기.</blockquote>' },
  { icon: '💻', title: '코드트리 문제 풀이', tags: ['공부', '코딩'], body: '<p>행복한 수열의 개수 문제를 풀었다. 처음엔 <code>행/열</code>을 따로 세는 걸 놓쳤다.</p><div class="todo done"><span class="box">✔</span><span>시뮬레이션 2문제</span></div><div class="todo"><span class="box"></span><span>DP 복습</span></div>' },
  { icon: '🍜', title: '친구와 저녁', tags: ['일상', '친구'], body: '<p>오랜만에 친구를 만나 라멘을 먹었다. 요즘 고민을 털어놓으니 마음이 가벼워졌다.</p><div class="callout"><span class="icon">💡</span><div>다음 달에 같이 등산 가기로 약속!</div></div>' },
  { icon: '🌧️', title: '비 오는 화요일', tags: ['생각'], body: '<p>하루 종일 비가 왔다. 집에서 음악을 들으며 정리를 했다.</p><h3>오늘의 노래</h3><ol><li>잔나비 - 주저하는 연인들을 위해</li><li>아이유 - 밤편지</li></ol>' },
  { icon: '🎯', title: '이번 달 목표 점검', tags: ['계획'], body: '<h3>잘한 것</h3><p>매일 한 문제씩 풀기를 지키고 있다.</p><h3>아쉬운 것</h3><p>운동을 자주 빼먹었다.</p><details><summary>다음 주 계획</summary><p>주 3회 헬스장 가기</p></details>' },
];

function entriesFor(month) {
  const [y, m] = month.split('-').map(Number);
  const days = new Date(y, m, 0).getDate();
  const picks = [2, 5, 9, 14, 18, 21, 23, 26].filter((d) => d <= days);
  return picks.map((day, i) => {
    const s = samples[(i + m) % samples.length];
    const date = `${month}-${String(day).padStart(2, '0')}`;
    return { id: `0000de00${month.replace('-', '')}${String(day).padStart(2, '0')}`.padEnd(32, '0'), title: s.title, date, icon: s.icon, cover: null, tags: s.tags, url: null, edited: date, sample: s };
  });
}

export function demoEntries(month) {
  const today = new Date().toISOString().slice(0, 10);
  return entriesFor(month).filter((e) => e.date <= today).map(({ sample, ...e }) => e).reverse();
}

export function demoContent(id) {
  const month = `${id.slice(8, 12)}-${id.slice(12, 14)}`;
  const found = entriesFor(month).find((e) => e.id === id);
  if (!found) throw Object.assign(new Error('없는 일기예요'), { status: 404 });
  const { sample, ...entry } = found;
  return { ...entry, html: sample.body };
}
