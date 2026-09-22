'use strict';

jest.mock('../config', () => ({
  dbPath: ':memory:',
  sqliteCacheKb: 2048,
  sqliteMmapBytes: 1048576
}));

describe('db/connection', () => {
  it('sobe com os pragmas de cache de pagina aplicados', () => {
    const { db } = require('./connection');

    // cache_size negativo = KB (convencao do SQLite)
    expect(db.prepare('PRAGMA cache_size').get().cache_size).toBe(-2048);
    expect(db.prepare('PRAGMA temp_store').get().temp_store).toBe(2); // 2 = MEMORY
  });
});
