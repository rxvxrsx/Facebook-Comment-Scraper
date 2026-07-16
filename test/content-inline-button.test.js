const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const contentScript = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');

test('inline scrape button blocks Facebook navigation during capture', () => {
  assert.match(
    contentScript,
    /window\.addEventListener\('click', handleInlineButtonInteraction, true\)/
  );
  assert.match(contentScript, /event\.preventDefault\(\)/);
  assert.match(contentScript, /event\.stopImmediatePropagation\(\)/);
  assert.doesNotMatch(contentScript, /btn\.addEventListener\('click'/);
});

test('inline scrape resumes automatically after Facebook opens a permalink', () => {
  assert.match(contentScript, /action: 'queueInlineScrape'/);
  assert.match(contentScript, /action: 'getQueuedInlineScrape'/);
  assert.match(contentScript, /void resumeQueuedInlineScrape\(\)/);
});

test('Reel pages receive a floating scrape button bound to their comment container', () => {
  assert.match(contentScript, /inlineButtonTargets\.set\(btn, post\)/);
  assert.match(contentScript, /btn\.dataset\.floating = isReelPage \? 'true' : 'false'/);
  assert.match(contentScript, /btn\.style\.position = isReelPage \? 'fixed' : 'absolute'/);
});

test('inline scrape buttons can be enabled or removed at runtime', () => {
  assert.match(contentScript, /case 'setInlineButtonEnabled':/);
  assert.match(contentScript, /if \(!inlineButtonEnabled\) return;/);
  assert.match(contentScript, /document\.querySelectorAll\(INLINE_BUTTON_SELECTOR\)/);
});
