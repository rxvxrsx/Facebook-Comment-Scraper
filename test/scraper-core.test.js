const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');

const {
  classifyExpandControlText,
  countMainCommentsByOffsets,
  findExpandCandidates,
  getFacebookProfileKey,
  waitForCondition,
  waitForDomChange
} = require('../scraper-core');

function loadFixture(name) {
  const html = fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
  return new JSDOM(html, { url: 'https://www.facebook.com/groups/10/posts/20' });
}

function getCommentOffsets(document) {
  return Array.from(document.querySelectorAll('[data-kind] [data-profile]'), element =>
    Number(element.dataset.left)
  );
}

test('English fixture identifies main comments and expand controls', () => {
  const { document } = loadFixture('comments-en.html').window;
  assert.equal(countMainCommentsByOffsets(getCommentOffsets(document)), 2);

  const controls = Array.from(document.querySelectorAll('[role="button"]'), element =>
    classifyExpandControlText(element.textContent, true)
  ).filter(Boolean);
  assert.deepEqual(controls, ['replies', 'comments']);
});

test('Thai fixture identifies main comments and localized controls', () => {
  const { document } = loadFixture('comments-th.html').window;
  assert.equal(countMainCommentsByOffsets(getCommentOffsets(document)), 1);

  const controls = Array.from(document.querySelectorAll('[role="button"]'), element =>
    classifyExpandControlText(element.textContent, true)
  ).filter(Boolean);
  assert.deepEqual(controls, ['replies', 'comments']);
});

test('reply controls respect expandReplies option', () => {
  assert.equal(classifyExpandControlText('View 4 replies', false), null);
  assert.equal(classifyExpandControlText('ดูการตอบกลับ 4 รายการ', false), null);
  assert.equal(classifyExpandControlText('View more comments', false), 'comments');
});

test('nested Facebook controls collapse to deepest clickable candidate', () => {
  const { document } = loadFixture('comments-en.html').window;
  const elements = document.querySelectorAll('[role="button"], span, div, a');
  const rawReplyCount = Array.from(elements).filter(element =>
    classifyExpandControlText(element.textContent, true) === 'replies'
  ).length;
  const deduped = findExpandCandidates(elements, { expandReplies: true });
  assert.equal(rawReplyCount > 1, true);
  assert.equal(deduped.filter(candidate => candidate.type === 'replies').length, 1);
});

test('limit-aware controls stop loading main comments but keep visible replies', () => {
  const { document } = loadFixture('comments-en.html').window;
  const elements = document.querySelectorAll('[role="button"], span, div, a');
  const candidates = findExpandCandidates(elements, { expandReplies: true, limitReached: true });
  assert.deepEqual(candidates.map(candidate => candidate.type), ['replies']);
});

test('candidate can retry only after visible comment count advances', () => {
  const { document } = loadFixture('comments-en.html').window;
  const elements = document.querySelectorAll('[role="button"], span, div, a');
  const clickedAtCount = new WeakMap();
  const first = findExpandCandidates(elements, { expandReplies: true });
  clickedAtCount.set(first[0].element, 3);

  const sameProgress = findExpandCandidates(elements, {
    expandReplies: true,
    isClicked: element => clickedAtCount.get(element) === 3
  });
  const advanced = findExpandCandidates(elements, {
    expandReplies: true,
    isClicked: element => clickedAtCount.get(element) === 4
  });
  assert.equal(sameProgress.length, first.length - 1);
  assert.equal(advanced.length, first.length);
});

test('profile keys distinguish people URLs and normalize numeric IDs', () => {
  assert.equal(getFacebookProfileKey('/profile.php?id=123'), 'id:123');
  assert.equal(getFacebookProfileKey('/groups/10/user/123'), 'id:123');
  assert.equal(getFacebookProfileKey('/people/Alice/111'), 'people:111');
  assert.equal(getFacebookProfileKey('/people/Bob/222'), 'people:222');
  assert.notEqual(getFacebookProfileKey('/people/Alice/111'), getFacebookProfileKey('/people/Bob/222'));
});

test('adaptive condition wait resolves when matching DOM arrives', async () => {
  const dom = new JSDOM('<main id="root"></main>');
  const root = dom.window.document.getElementById('root');
  const pending = waitForCondition(root, () => root.querySelector('[data-ready]'), 500);
  setTimeout(() => root.insertAdjacentHTML('beforeend', '<div data-ready></div>'), 20);
  const result = await pending;
  assert.equal(result?.hasAttribute('data-ready'), true);
});

test('adaptive mutation wait reports change and timeout', async () => {
  const dom = new JSDOM('<main id="root"></main>');
  const root = dom.window.document.getElementById('root');
  const changed = waitForDomChange(root, 500);
  setTimeout(() => root.append(dom.window.document.createElement('div')), 20);
  assert.equal(await changed, true);
  assert.equal(await waitForDomChange(root, 10), false);
});
