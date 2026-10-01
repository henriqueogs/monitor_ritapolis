'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
jest.mock('../db/connection', () => {
  const { DatabaseSync } = require('node:sqlite');
  return { db: new DatabaseSync(':memory:') };
});
const { db } = require('../db/connection');
db.exec(fs.readFileSync(path.resolve(__dirname, '../db/schema.sql'), 'utf8'));
require('../db');
const { createQueue } = require('./queue');
const { plan, planAi, planFinance, windows } = require('./planner');
const now = new Date('2026-09-30T19:00:00Z');
const text = 'Documento oficial da municipalidade. '.repeat(40);
let q;
beforeEach(() => {
  db.exec('DELETE FROM documentos_resumos_ai; DELETE FROM documentos;');
  q = createQueue(db);
  db.exec('DELETE FROM pipeline_jobs; DELETE FROM pipeline_meta;');
});
function document(id, ano, date) {
  db.prepare(
    `INSERT INTO documentos (id, fonte, tipo, titulo, ano, data_publicacao, url_origem, texto_completo, atualizado_em, coletado_em)
    VALUES (?, 'site_prefeitura', 'lei', 'Lei municipal', ?, ?, ?, ?, '2026-09-30', '2026-09-30')`
  ).run(id, ano, date, `https://official.example/${id}`, text);
}
test('source checks wait thirty elapsed days across month rollover and reuse previous completed checks', () => {
  document(1, 2026, '2026-09-29');
  const url = 'https://official.example/file.pdf';
  db.prepare('UPDATE documentos SET url_pdf = ? WHERE id=1').run(url);
  const prior = q.enqueue({ kind: 'source-check', entity: 1, hash: `2026-09:${url}` }, now);
  db.prepare("UPDATE pipeline_jobs SET status='ok', finished_at=? WHERE id=?").run(
    now.toISOString(),
    prior.id
  );
  plan(q, new Date('2026-10-01T19:00:00Z'));
  expect(
    db.prepare("SELECT count(*) AS n FROM pipeline_jobs WHERE kind='source-check'").get().n
  ).toBe(1);
  const due = new Date(now.getTime() + 30 * 86400000);
  plan(q, due);
  plan(q, due);
  expect(
    db.prepare("SELECT count(*) AS n FROM pipeline_jobs WHERE kind='source-check'").get().n
  ).toBe(2);
  db.prepare('UPDATE documentos SET url_pdf = ? WHERE id=1').run(`${url}?revision=2`);
  plan(q, due);
  expect(
    db.prepare("SELECT count(*) AS n FROM pipeline_jobs WHERE kind='source-check'").get().n
  ).toBe(3);
});
test('recent publications first, ten historical documents daily, unchanged rescans do not duplicate jobs', () => {
  for (let id = 1; id <= 20; id++) {
    document(id, 2025, null);
  }
  for (let id = 21; id <= 32; id++) {
    document(id, 2026, '2026-09-29');
  }
  planAi(q, now);
  planAi(q, now);
  expect(db.prepare('SELECT COUNT(*) AS n FROM pipeline_jobs WHERE historical = 1').get().n).toBe(
    10
  );
  expect(db.prepare('SELECT COUNT(*) AS n FROM pipeline_jobs').get().n).toBe(22);
  expect(Number(q.claim(now).entity)).toBeGreaterThan(20);
});
test('valid current summaries are reused; only dependent factual work is queued', () => {
  document(1, 2026, '2026-09-29');
  const signature = crypto.createHash('sha256').update(text).digest('hex');
  db.prepare(
    `INSERT INTO documentos_resumos_ai(documento_id, provider, modelo, contrato_versao, resumo_json, texto_hash, status)
    VALUES (1,'nvidia','test','1.1','{}',?,'ok')`
  ).run(signature);
  planAi(q, now);
  planAi(q, now);
  expect(db.prepare('SELECT kind FROM pipeline_jobs').all()).toEqual([{ kind: 'facts' }]);
});
test('morning collection queues only four official sources, no duplicate financial or PNCP scans', () => {
  plan(q, now);
  plan(q, now);
  expect(
    db
      .prepare("SELECT entity FROM pipeline_jobs WHERE kind = 'collection'")
      .all()
      .map(r => r.entity)
      .sort()
  ).toEqual(['camara_legislacao', 'camara_projetos', 'legislacao_prefeitura', 'site_prefeitura']);
});
test('expenses use seven-day lookback and recover missed intervals with committed boundaries', () => {
  planFinance(q, now);
  const recent = JSON.parse(
    db.prepare("SELECT payload FROM pipeline_jobs WHERE kind = 'expenses'").get().payload
  );
  expect(recent.ini).toBe('2026-09-24');
  expect(recent.fim).toBe('2026-09-30');
  db.exec('DELETE FROM pipeline_jobs;');
  q.setMeta('expenses_through', '2026-09-10');
  planFinance(q, now);
  expect(
    JSON.parse(
      db
        .prepare("SELECT payload FROM pipeline_jobs WHERE kind = 'expenses' ORDER BY id LIMIT 1")
        .get().payload
    ).ini
  ).toBe('2026-09-11');
  expect(windows('2026-09-11', '2026-09-30')).toHaveLength(3);
});
test('January windows never mix exercises', () => {
  planFinance(q, new Date('2027-01-02T23:00:00Z'));
  const tasks = db
    .prepare("SELECT payload FROM pipeline_jobs WHERE kind = 'expenses'")
    .all()
    .map(r => JSON.parse(r.payload));
  expect(tasks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ ano: 2026, fim: '2026-12-31' }),
      expect.objectContaining({ ano: 2027, ini: '2027-01-01' }),
    ])
  );
});
afterAll(() => db.close());
