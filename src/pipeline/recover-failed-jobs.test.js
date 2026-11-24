'use strict';
const { DatabaseSync } = require('node:sqlite');
const { createQueue } = require('./queue');
const { createProgress } = require('./progress');
const { recoverFailedJobs, listarCandidatos } = require('./recover-failed-jobs');
let db, q;
const now = new Date('2026-11-05T01:00:00Z');
const reason = 'Runtime corrigido; uma retomada manual com a mesma fonte';
beforeEach(() => { db = new DatabaseSync(':memory:'); q = createQueue(db); });
afterEach(() => db.close());
function failed({ kind = 'summary', entity = '992', attempts = 3, error = 'Request timed out.' } = {}) {
  const job = q.enqueue({ kind, entity, hash: 'source-hash', version: '1.1:resume-1', historical: true }, now);
  db.prepare("UPDATE pipeline_jobs SET status='failed',attempts=?,error=? WHERE id=?").run(attempts, error, job.id);
  createProgress(db, job.identity).save('verified-chunk', { valid: true });
  return job;
}
const options = ids => ({ jobIds: ids, reason, validateInput: () => true, assertSafety: () => {}, now });

test('dry-run identifies eligible jobs without changing their state or attempt count', () => {
  const job = failed({ attempts: 1 });
  expect(recoverFailedJobs(db, options([job.id])).changes).toHaveLength(1);
  expect(q.get(job.id)).toMatchObject({ status: 'failed', attempts: 1 });
  expect(q.meta(`manual_recovery:${job.id}`)).toBeNull();
});

test('exhausted job needs explicit bounded recovery; identity, progress, budget and attempt history survive', () => {
  const job = failed();
  expect(recoverFailedJobs(db, options([job.id])).blocked[0].reason).toBe('attempts_exhausted');
  const opts = { ...options([job.id]), allowExhausted: true, apply: true };
  recoverFailedJobs(db, opts);
  expect(q.get(job.id)).toMatchObject({ identity: job.identity, status: 'pending', attempts: 3, historical: 1 });
  expect(createProgress(db, job.identity).load('verified-chunk')).toEqual({ valid: true });
  const capped = createQueue(db, { historicalBudgetMs: 0 });
  expect(capped.claim(now)).toBeNull();
  q.claim(now);
  q.finish(job.id, { error: 'Request timed out.', transient: true }, now);
  expect(q.get(job.id)).toMatchObject({ status: 'failed', attempts: 4 });
  expect(recoverFailedJobs(db, opts).blocked[0].reason).toBe('already_recovered');
});

test('stale inputs, newer work and quality review never get blindly retried', () => {
  const stale = failed({ entity: '1', attempts: 1 });
  const replaced = failed({ entity: '2', attempts: 1 });
  q.enqueue({ kind: 'summary', entity: '2', hash: 'new', version: '1.1:resume-1' }, now);
  const review = failed({ entity: '3', attempts: 1, error: 'Texto insuficiente: extracao/OCR exige revisao' });
  const report = recoverFailedJobs(db, {
    ...options([stale.id, replaced.id, review.id]), apply: true,
    validateInput: job => job.id !== stale.id,
  });
  expect(report.changes).toEqual([]);
  expect(report.blocked.map(row => row.reason)).toEqual(['input_changed', 'newer_job', 'not_recoverable']);
});

test('PNCP access refusal is eligible only for its collection; safety failure prevents all writes', () => {
  const pncp = failed({ kind: 'collection', entity: 'pncp', attempts: 1, error: 'PNCP HTTP 403' });
  const other = failed({ kind: 'collection', entity: 'camara_legislacao', attempts: 1, error: 'PNCP HTTP 403' });
  const opts = { ...options([pncp.id, other.id]), apply: true, assertSafety: () => { throw new Error('backup vencido'); } };
  expect(() => recoverFailedJobs(db, opts)).toThrow('backup vencido');
  expect(q.get(pncp.id).status).toBe('failed');
  const report = recoverFailedJobs(db, { ...opts, assertSafety: () => {} });
  expect(report.changes).toHaveLength(1);
  expect(report.blocked).toEqual([{ id: other.id, reason: 'not_recoverable' }]);
});

test('a validation failure rolls back earlier changes and recovery audit records', () => {
  const a = failed({ entity: '1', attempts: 1 });
  const b = failed({ entity: '2', attempts: 1 });
  expect(() => recoverFailedJobs(db, {
    ...options([a.id, b.id]), apply: true,
    validateInput: job => { if (job.id === b.id) { throw new Error('source unavailable'); } return true; },
  })).toThrow('source unavailable');
  expect(q.get(a.id).status).toBe('failed');
  expect(q.meta(`manual_recovery:${a.id}`)).toBeNull();
});

test('rejects unbounded or duplicate selections and requires explicit source/safety checks', () => {
  const job = failed({ attempts: 1 });
  expect(() => recoverFailedJobs(db, options([job.id, job.id]))).toThrow(/IDs/);
  expect(() => recoverFailedJobs(db, options(Array.from({ length: 11 }, (_, i) => i + 1)))).toThrow(/IDs/);
  expect(() => recoverFailedJobs(db, { ...options([job.id]), validateInput: undefined })).toThrow(/obrigatorios/);
});

describe('contrato_rejeitado em itens', () => {
  // Saída incompleta recusada pelo contrato estrito (ZodError serializado como lista de issues).
  const ZOD = '[{"code":"invalid_type","expected":"string","path":["itens_solicitados",0,"descricao"]}]';

  test('itens recusados pelo contrato estrito podem ser retomados uma vez, com checkpoints', () => {
    const job = failed({ kind: 'items', entity: '501', attempts: 1, error: ZOD });
    const opts = { ...options([job.id]), apply: true };

    const report = recoverFailedJobs(db, opts);

    expect(report.changes).toEqual([expect.objectContaining({ id: job.id, kind: 'items' })]);
    expect(q.get(job.id)).toMatchObject({ status: 'pending', attempts: 1, error: null });
    expect(createProgress(db, job.identity).load('verified-chunk')).toEqual({ valid: true });
    expect(q.meta(`manual_recovery:${job.id}`)).toMatchObject({ category: 'contrato_rejeitado' });
  });

  test('contrato_rejeitado fora de itens e revisão de fonte continuam bloqueados', () => {
    const resumo = failed({ kind: 'summary', entity: '502', attempts: 1, error: ZOD });
    const fonte = failed({ kind: 'items', entity: '503', attempts: 1,
      error: 'Itens: mais de um resultado global; exige revisao por fonte' });

    const report = recoverFailedJobs(db, options([resumo.id, fonte.id]));

    expect(report.blocked).toEqual([
      { id: resumo.id, reason: 'not_recoverable' },
      { id: fonte.id, reason: 'not_recoverable' },
    ]);
  });
});

describe('listarCandidatos', () => {
  const ZOD = '[{"code":"too_small","minimum":1,"path":["itens_solicitados"]}]';

  test('lista só a falha mais recente de cada etapa, da categoria pedida e ainda não retomada', () => {
    const a = failed({ kind: 'items', entity: '601', attempts: 1, error: ZOD });
    const b = failed({ kind: 'items', entity: '602', attempts: 3, error: ZOD });
    const jaRetomado = failed({ kind: 'items', entity: '603', attempts: 1, error: ZOD });
    q.setMeta(`manual_recovery:${jaRetomado.id}`, { at: now.toISOString() });
    failed({ kind: 'items', entity: '604', attempts: 1, error: 'Request timed out.' });
    failed({ kind: 'items', entity: '605', attempts: 1, error: ZOD });
    q.enqueue({ kind: 'items', entity: '605', hash: 'novo', version: '3' }, now);

    const candidatos = listarCandidatos(db, { categoria: 'contrato_rejeitado' });

    expect(candidatos.map(c => c.id)).toEqual([b.id, a.id]);
    expect(candidatos[0]).toEqual({ id: b.id, kind: 'items', entity: '602', attempts: 3 });
  });

  test('respeita o limite e recusa categoria que não pode ser retomada', () => {
    for (let i = 0; i < 12; i++) { failed({ kind: 'items', entity: String(700 + i), attempts: 1, error: ZOD }); }

    expect(listarCandidatos(db, { categoria: 'contrato_rejeitado', limite: 10 })).toHaveLength(10);
    expect(() => listarCandidatos(db, { categoria: 'revisao_fonte' })).toThrow(/categoria/);
  });
});
