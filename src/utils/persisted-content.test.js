'use strict';
const { hasContentChanges, canonicalJson } = require('./persisted-content');

describe('persisted-content', () => {
  test('JSON key ordering, including nested objects, does not trigger writes', () => {
    expect(hasContentChanges({ dados_extras: '{"b":2,"a":{"y":2,"x":1}}' },
      { dados_extras: '{"a":{"x":1,"y":2},"b":2}' })).toBe(false);
  });
  test('money, references, null, array order and JSON types remain significant', () => {
    for (const [a, b] of [[1, 1.01], [null, ''], ['07/2026', '08/2026']]) {
      expect(hasContentChanges({ value: a }, { value: b })).toBe(true);
    }
    expect(canonicalJson('[1,2]')).not.toBe(canonicalJson('[2,1]'));
    expect(canonicalJson('{"valor":"1"}')).not.toBe(canonicalJson('{"valor":1}'));
  });
});
