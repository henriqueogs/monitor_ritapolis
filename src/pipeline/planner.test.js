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
  db.exec('DELETE FROM documentos_anexos_resumos_ai; DELETE FROM documentos_anexos; DELETE FROM documentos_resumos_ai; DELETE FROM documentos;');
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
test('fresh complete extraction delays source verification without losing a changed URL', () => {
  document(1, 2026, '2026-09-29');
  const url = 'https://official.example/fresh.pdf';
  db.prepare('UPDATE documentos SET url_pdf=? WHERE id=1').run(url);
  const extraction = q.enqueue({ kind: 'extract', entity: 1, hash: 'bytes', version: '3' }, now);
  q.claim(now);
  q.finish(extraction.id, { result: { source_url: url, file_hash: 'verified-bytes' } }, now);
  plan(q, new Date('2026-10-01T19:00:00Z'));
  expect(
    db.prepare("SELECT COUNT(*) AS n FROM pipeline_jobs WHERE kind='source-check'").get().n
  ).toBe(0);
  db.prepare('UPDATE documentos SET url_pdf=? WHERE id=1').run(`${url}?new=true`);
  plan(q, new Date('2026-10-01T19:00:00Z'));
  expect(
    db.prepare("SELECT COUNT(*) AS n FROM pipeline_jobs WHERE kind='source-check'").get().n
  ).toBe(1);
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
test('catch-up task force: historical documents per day follows config', () => {
  const config = require('../config');
  const original = config.pipelineHistoricalDocsPerDay;
  config.pipelineHistoricalDocsPerDay = 15;
  try {
    for (let id = 1; id <= 20; id++) {
      document(id, 2025, null);
    }
    planAi(q, now);
    expect(db.prepare('SELECT COUNT(*) AS n FROM pipeline_jobs WHERE historical = 1').get().n).toBe(15);
  } finally {
    config.pipelineHistoricalDocsPerDay = original;
  }
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

test('anexo longo com resumo truncado antigo e replanejado; curto valido nao e regenerado', () => {
  document(1, 2026, '2026-09-29');
  const signature = crypto.createHash('sha256').update(text).digest('hex');
  db.prepare(`INSERT INTO documentos_resumos_ai(documento_id,provider,modelo,contrato_versao,resumo_json,texto_hash,status)
    VALUES(1,'nvidia','test','1.1','{}',?,'ok')`).run(signature);
  for (const [id, source] of [[1, text], [2, text.repeat(10)]]) {
    const h = crypto.createHash('sha256').update(source).digest('hex');
    db.prepare(`INSERT INTO documentos_anexos(id,documento_id,url,texto_completo,texto_hash,status_extracao)
      VALUES(?,1,?,?,?,'ok')`).run(id, `https://official.example/anexo${id}.pdf`, source, h);
    db.prepare(`INSERT INTO documentos_anexos_resumos_ai(anexo_id,provider,modelo,contrato_versao,resumo_json,texto_hash,status)
      VALUES(?,'nvidia','test','anexo-2.0','{}',?,'ok')`).run(id, h);
  }
  const anexos = require('../db/inteligencia-fatos-repo').listarAnexosDocumento(1);
  expect(anexos[0].resumo_ai).not.toBeNull();
  expect(anexos[1].resumo_ai).toBeNull(); // don't serve known truncated legacy as current
  planAi(q, now);
  planAi(q, now);
  const jobs = db.prepare('SELECT kind,version,payload FROM pipeline_jobs').all();
  expect(jobs).toHaveLength(1);
  expect(jobs[0]).toMatchObject({ kind: 'anexo-summary', version: 'anexo-2.1-full' });
  expect(JSON.parse(jobs[0].payload).anexoId).toBe(2);
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

test('textless document with a recorded size limit is planned on the bounded disk path', () => {
  document(1, 2026, '2026-09-29');
  document(2, 2026, '2026-09-29');
  db.prepare("UPDATE documentos SET texto_completo=NULL, url_pdf='https://official.example/big.pdf' WHERE id=1").run();
  db.prepare("UPDATE documentos SET texto_completo=NULL, url_pdf='https://official.example/small.pdf' WHERE id=2").run();
  require('./file-policy')
    .createFilePolicy(db)
    .record('https://official.example/big.pdf', new Error('maxContentLength size of 52428800 exceeded'), now);
  planAi(q, now);
  const rows = db.prepare("SELECT entity,version,payload FROM pipeline_jobs WHERE kind='extract' ORDER BY entity").all();
  expect(rows).toHaveLength(2);
  expect(JSON.parse(rows[0].payload).largePdf).toBe(true);
  expect(rows[0].version).toBe('3:large-1');
  expect(JSON.parse(rows[1].payload).largePdf).toBeUndefined();
  expect(rows[1].version).toBe('3');
});

describe('edital com items em revisao nao trava as demais etapas', () => {
  function editalComResumo() {
    document(1, 2026, '2026-09-29');
    db.prepare("UPDATE documentos SET tipo = 'edital' WHERE id = 1").run();
    const signature = crypto.createHash('sha256').update(text).digest('hex');
    db.prepare(
      `INSERT INTO documentos_resumos_ai(documento_id, provider, modelo, contrato_versao, resumo_json, texto_hash, status)
      VALUES (1,'nvidia','test','1.1','{}',?,'ok')`
    ).run(signature);
  }
  const kinds = () => db.prepare('SELECT kind, status FROM pipeline_jobs ORDER BY id').all();

  test('items pendente segura a cadeia (integrated e facts dependem dele)', () => {
    editalComResumo();
    planAi(q, now);
    planAi(q, now);
    expect(kinds()).toEqual([{ kind: 'items', status: 'pending' }]);
  });

  test('items failed (revisao) segue para facts, sem enfileirar integrated', () => {
    editalComResumo();
    planAi(q, now);
    const items = q.claim(now);
    q.finish(items.id, { error: 'Itens: leitura excede o limite de tempo por documento; exige revisao' }, now);
    planAi(q, now);
    expect(kinds()).toEqual([
      { kind: 'items', status: 'failed' },
      { kind: 'facts', status: 'pending' },
    ]);
  });
});

describe('historicos sem resumo entram antes dos que so precisam de etapas seguintes', () => {
  const config = require('../config');
  let original;
  beforeEach(() => {
    original = config.pipelineHistoricalDocsPerDay;
    config.pipelineHistoricalDocsPerDay = 2;
  });
  afterEach(() => {
    config.pipelineHistoricalDocsPerDay = original;
  });

  function comResumoOk(id) {
    const signature = crypto.createHash('sha256').update(text).digest('hex');
    db.prepare(
      `INSERT INTO documentos_resumos_ai(documento_id, provider, modelo, contrato_versao, resumo_json, texto_hash, status)
      VALUES (?,'nvidia','test','1.1','{}',?,'ok')`
    ).run(id, signature);
  }

  test('vaga diaria vai para quem nao tem resumo, mesmo sendo mais antigo', () => {
    document(1, 2026, '2026-02-02');
    document(2, 2026, '2026-02-01');
    document(3, 2025, '2025-12-02');
    document(4, 2025, '2025-12-01');
    comResumoOk(1);
    comResumoOk(2);

    planAi(q, now);

    const jobs = db.prepare('SELECT kind, entity FROM pipeline_jobs ORDER BY entity').all();
    expect(jobs).toEqual([
      { kind: 'summary', entity: '3' },
      { kind: 'summary', entity: '4' },
    ]);
  });

  test('sobrando vaga, quem ja tem resumo segue para facts (nada deixa de ser planejado)', () => {
    config.pipelineHistoricalDocsPerDay = 3;
    document(1, 2026, '2026-02-02');
    document(3, 2025, '2025-12-02');
    document(4, 2025, '2025-12-01');
    comResumoOk(1);

    planAi(q, now);

    const jobs = db.prepare('SELECT kind, entity FROM pipeline_jobs ORDER BY entity').all();
    expect(jobs).toEqual([
      { kind: 'facts', entity: '1' },
      { kind: 'summary', entity: '3' },
      { kind: 'summary', entity: '4' },
    ]);
  });

  test('publicacao recente continua na frente de todos', () => {
    document(1, 2026, '2026-09-29');
    document(2, 2025, '2025-12-01');
    config.pipelineHistoricalDocsPerDay = 1;

    planAi(q, now);

    expect(db.prepare('SELECT entity, historical FROM pipeline_jobs ORDER BY entity').all()).toEqual([
      { entity: '1', historical: 0 },
      { entity: '2', historical: 1 },
    ]);
  });
});
