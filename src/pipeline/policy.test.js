'use strict';

const { DatabaseSync } = require('node:sqlite');
const { factsSignature, hash } = require('./policy');

function criarDb(jobs = []) {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE pipeline_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT, status TEXT, entity TEXT, input_hash TEXT);
    CREATE INDEX pipeline_status_kind ON pipeline_jobs(status, kind);`);
  const insere = db.prepare(
    'INSERT INTO pipeline_jobs (kind, status, entity, input_hash) VALUES (?, ?, ?, ?)'
  );
  for (const j of jobs) {
    insere.run(j.kind || 'facts', j.status || 'ok', j.entity, j.hash);
  }
  return db;
}

describe('factsSignature', () => {
  it('usa só o facts ok mais recente de cada documento e ignora outros tipos e status', () => {
    const db = criarDb([
      { entity: '2', hash: 'b-velho' },
      { entity: '1', hash: 'a' },
      { entity: '2', hash: 'b-novo' },
      { entity: '3', hash: 'c', status: 'failed' },
      { entity: '4', hash: 'd', kind: 'summary' },
    ]);
    const esperado = hash([
      ['1', 'a'],
      ['2', 'b-novo'],
    ]);
    expect(factsSignature(db)).toBe(esperado);
  });

  it('o job pendente substitui/entra no mapa do documento', () => {
    const db = criarDb([{ entity: '1', hash: 'a' }]);
    const sig = factsSignature(db, { entity: '1', input_hash: 'a2' });
    expect(sig).toBe(hash([['1', 'a2']]));
    expect(sig).not.toBe(factsSignature(db));
  });

  it('não usa subconsulta correlacionada (era O(n²): ~3 min com 28 mil jobs)', () => {
    const db = criarDb([{ entity: '1', hash: 'a' }]);
    const spy = jest.spyOn(db, 'prepare');
    factsSignature(db);
    const sql = spy.mock.calls.map(c => c[0]).join(' ');
    const plano = db
      .prepare(`EXPLAIN QUERY PLAN ${sql}`)
      .all()
      .map(p => p.detail)
      .join('\n');
    expect(plano).not.toMatch(/CORRELATED/);
  });
});
