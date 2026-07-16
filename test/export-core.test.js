const assert = require('node:assert/strict');
const test = require('node:test');

const {
  DEFAULT_EXPORT_FIELD_KEYS,
  buildCsvTable,
  buildJsonTree,
  normalizeFieldKeys
} = require('../export-core');

const comments = [
  {
    id: 'comment_1',
    parentId: null,
    type: 'Comment',
    name: 'Alice',
    profileUrl: 'https://facebook.com/alice',
    avatar: 'https://cdn.example/alice.jpg',
    timestamp: '1h',
    text: 'first\ncomment',
    imageUrl: 'https://cdn.example/photo.jpg',
    photoUrl: 'https://facebook.com/photo.php?fbid=1'
  },
  {
    id: 'comment_2',
    parentId: 'comment_1',
    type: 'Reply',
    name: 'Bob',
    profileUrl: 'https://facebook.com/bob',
    avatar: '',
    timestamp: '30m',
    text: 'reply',
    imageUrl: null,
    photoUrl: null
  }
];

test('default CSV fields preserve previous export format', () => {
  const table = buildCsvTable(comments, DEFAULT_EXPORT_FIELD_KEYS);
  assert.deepEqual(table.headers, [
    'ID', 'Type', 'Author_Name', 'Profile_Link', 'Timestamp', 'Text', 'Photo_Link'
  ]);
  assert.equal(table.rows[0][5], 'first comment');
});

test('CSV exports only selected fields in canonical order', () => {
  const table = buildCsvTable(comments, ['text', 'photoUrl', 'name']);
  assert.deepEqual(table.headers, ['Author_Name', 'Text', 'Photo_Link']);
  assert.deepEqual(table.rows[0], ['Alice', 'first comment', 'https://facebook.com/photo.php?fbid=1']);
});

test('JSON keeps reply hierarchy when ID fields are not exported', () => {
  const tree = buildJsonTree(comments, ['name', 'text']);
  assert.deepEqual(tree, [{
    name: 'Alice',
    text: 'first\ncomment',
    replies: [{ name: 'Bob', text: 'reply' }]
  }]);
});

test('unknown and duplicate fields are removed', () => {
  assert.deepEqual(
    normalizeFieldKeys(['text', 'unknown', 'parentId', 'avatar', 'imageUrl', 'text', 'id']),
    ['id', 'text']
  );
});
