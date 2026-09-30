'use strict';

// JSON key ordering is not a content change. Array order, types, nulls and
// every source field remain significant, including financial references.
function canonicalJson(value) {
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return value; }
  }
  function sort(input) {
    if (Array.isArray(input)) { return input.map(sort); }
    if (input && typeof input === 'object') {
      return Object.fromEntries(Object.keys(input).sort().map((key) => [key, sort(input[key])]));
    }
    return input;
  }
  return JSON.stringify(sort(value));
}

function hasContentChanges(existing, payload, jsonFields = ['dados_extras']) {
  if (!existing) { return true; }
  return Object.keys(payload).some((key) => jsonFields.includes(key)
    ? canonicalJson(existing[key]) !== canonicalJson(payload[key])
    : existing[key] !== payload[key]);
}

module.exports = { canonicalJson, hasContentChanges };
