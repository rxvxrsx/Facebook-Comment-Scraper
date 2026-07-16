const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');

const {
  DEFAULT_EXPORT_FIELD_KEYS,
  EXPORT_FIELDS
} = require('../export-core');

function loadSidePanel() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'sidepanel.html'), 'utf8');
  return new JSDOM(html).window.document;
}

test('side panel renders every supported export field', () => {
  const document = loadSidePanel();
  const values = Array.from(document.querySelectorAll('.export-field'), input => input.value);
  assert.deepEqual(values, EXPORT_FIELDS.map(field => field.key));
});

test('side panel defaults match backward-compatible export fields', () => {
  const document = loadSidePanel();
  const checked = Array.from(document.querySelectorAll('.export-field:checked'), input => input.value);
  assert.deepEqual(checked, DEFAULT_EXPORT_FIELD_KEYS);
});

test('export core loads before side panel controller', () => {
  const document = loadSidePanel();
  const scripts = Array.from(document.querySelectorAll('script[src]'), script => script.getAttribute('src'));
  assert.deepEqual(scripts, ['scraper-core.js', 'export-core.js', 'sidepanel.js']);
});

test('export field menu exposes an accessible toggle button', () => {
  const document = loadSidePanel();
  const button = document.getElementById('btn-toggle-fields');
  const panel = document.getElementById('export-fields-panel');
  assert.equal(button.getAttribute('aria-expanded'), 'false');
  assert.equal(button.getAttribute('aria-controls'), panel.id);
  assert.equal(panel.hidden, true);
});

test('Live Preview exposes a disabled lock until results exist', () => {
  const document = loadSidePanel();
  const button = document.getElementById('btn-lock-preview');
  assert.equal(button.getAttribute('aria-pressed'), 'false');
  assert.equal(button.disabled, true);
});
