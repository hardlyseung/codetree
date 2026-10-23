import test from 'node:test';
import assert from 'node:assert/strict';
import { richTextToHtml, blocksToHtml, pageToEntry, toLocalDate } from './notion.js';

const rt = (text, annotations = {}, href = null) => ({ plain_text: text, annotations, href });

test('rich text: 서식과 이스케이프', () => {
  assert.equal(richTextToHtml([rt('<b>', { bold: true })]), '<strong>&lt;b&gt;</strong>');
  assert.equal(richTextToHtml([rt('x', {}, 'javascript:alert(1)')]), '<a href="#" target="_blank" rel="noopener">x</a>');
});

test('blocks: 연속된 리스트는 하나로 묶인다', () => {
  const li = (t) => ({ type: 'bulleted_list_item', bulleted_list_item: { rich_text: [rt(t)] } });
  const html = blocksToHtml([li('a'), li('b'), { type: 'paragraph', paragraph: { rich_text: [rt('c')] } }]);
  assert.equal(html, '<ul><li>a</li><li>b</li></ul><p>c</p>');
});

test('blocks: 토글 안의 자식 블록', () => {
  const html = blocksToHtml([{ type: 'toggle', toggle: { rich_text: [rt('t')] },
    children: [{ type: 'to_do', to_do: { rich_text: [rt('d')], checked: true } }] }]);
  assert.match(html, /<details><summary>t<\/summary><div class="todo done">/);
});

test('pageToEntry: 날짜 속성 우선, 없으면 생성일(현지 시간)', () => {
  const page = { id: '1', created_time: '2026-10-22T16:30:00.000Z', icon: { type: 'emoji', emoji: '☀️' },
    properties: { 이름: { type: 'title', title: [rt('하루')] }, 날짜: { type: 'date', date: { start: '2026-10-01' } },
      태그: { type: 'multi_select', multi_select: [{ name: '일상' }] } } };
  assert.deepEqual(
    { ...pageToEntry(page, { dateProp: '날짜' }) },
    { id: '1', title: '하루', date: '2026-10-01', icon: '☀️', cover: null, tags: ['일상'], url: undefined, edited: undefined },
  );
  assert.equal(pageToEntry(page).date, '2026-10-23');
  assert.equal(toLocalDate('2026-10-22T16:30:00.000Z', 'UTC'), '2026-10-22');
});
