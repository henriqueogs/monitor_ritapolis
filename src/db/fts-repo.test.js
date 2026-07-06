'use strict';

const { sanitizeFtsQuery } = require('./fts-repo');

describe('sanitizeFtsQuery', () => {
  test('converts plain terms to bounded prefix queries', () => {
    expect(sanitizeFtsQuery('pregao escolar')).toBe('pregao* AND escolar*');
  });

  test('strips raw FTS operators and punctuation from user input', () => {
    expect(sanitizeFtsQuery('"pregao" OR titulo:secret*')).toBe('pregao* AND titulosecret*');
  });

  test('returns null for empty or punctuation-only queries', () => {
    expect(sanitizeFtsQuery(' " * : ')).toBeNull();
  });

  test('limits term count to reduce expensive MATCH queries', () => {
    expect(sanitizeFtsQuery('a b c d e f g h i j')).toBe('a* AND b* AND c* AND d* AND e* AND f* AND g* AND h*');
  });
});
