(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.FbExportCore = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const EXPORT_FIELDS = Object.freeze([
    Object.freeze({ key: 'id', csvHeader: 'ID' }),
    Object.freeze({ key: 'type', csvHeader: 'Type' }),
    Object.freeze({ key: 'name', csvHeader: 'Author_Name' }),
    Object.freeze({ key: 'profileUrl', csvHeader: 'Profile_Link' }),
    Object.freeze({ key: 'timestamp', csvHeader: 'Timestamp' }),
    Object.freeze({ key: 'text', csvHeader: 'Text' }),
    Object.freeze({ key: 'photoUrl', csvHeader: 'Photo_Link' })
  ]);

  const DEFAULT_EXPORT_FIELD_KEYS = Object.freeze([
    'id',
    'type',
    'name',
    'profileUrl',
    'timestamp',
    'text',
    'photoUrl'
  ]);

  function normalizeFieldKeys(keys) {
    const requested = new Set(Array.isArray(keys) ? keys : []);
    return EXPORT_FIELDS.filter(field => requested.has(field.key)).map(field => field.key);
  }

  function projectRecord(record, fieldKeys) {
    const projected = {};
    for (const key of normalizeFieldKeys(fieldKeys)) {
      projected[key] = record[key] ?? null;
    }
    return projected;
  }

  function buildCsvTable(comments, fieldKeys) {
    const normalizedKeys = normalizeFieldKeys(fieldKeys);
    const fieldsByKey = new Map(EXPORT_FIELDS.map(field => [field.key, field]));
    return {
      headers: normalizedKeys.map(key => fieldsByKey.get(key).csvHeader),
      rows: comments.map(comment => normalizedKeys.map(key => {
        const value = comment[key] ?? '';
        return key === 'text' && typeof value === 'string'
          ? value.replace(/\s*\r?\n\s*/g, ' ')
          : value;
      }))
    };
  }

  function buildJsonTree(comments, fieldKeys) {
    const mainComments = [];
    const mainCommentsBySourceId = new Map();

    for (const comment of comments) {
      if (comment.type !== 'Comment') continue;
      const projected = projectRecord(comment, fieldKeys);
      projected.replies = [];
      mainComments.push(projected);
      mainCommentsBySourceId.set(comment.id, projected);
    }

    for (const comment of comments) {
      if (comment.type !== 'Reply') continue;
      const parent = mainCommentsBySourceId.get(comment.parentId);
      if (parent) parent.replies.push(projectRecord(comment, fieldKeys));
    }

    return mainComments;
  }

  return {
    DEFAULT_EXPORT_FIELD_KEYS,
    EXPORT_FIELDS,
    buildCsvTable,
    buildJsonTree,
    normalizeFieldKeys,
    projectRecord
  };
});
