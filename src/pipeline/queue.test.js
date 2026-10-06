'use strict';
const { DatabaseSync } = require('node:sqlite');
const { createQueue } = require('./queue');
const { hash, isRecent, transientError, localTime } = require('./policy');
let db, q;
const now = new Date('2026-09-30T19:00:00Z');
beforeEach(() => {
  db = new DatabaseSync(':memory:');
  q = createQueue(db);
});
afterEach(() => db.close());
const task = { kind: 'summary', entity: 7, hash: 'abc', version: '1.1' };

test('checkpoints survive interruption and are cleared only with committed queue success', () => {
  const job = q.enqueue(task, now);
  const progress = require('./progress').createProgress(db, job.identity);
  progress.save('completed', true);
  q.claim(now);
  q.finish(job.id, { deferred: true }, now);
  expect(progress.load('completed')).toBe(true);
  const later = new Date(now.getTime() + 10000);
  q.claim(later);
  q.finish(job.id, { error: 'ECONNRESET', transient: true }, later);
  expect(progress.load('completed')).toBe(true);
  q.claim(new Date(later.getTime() + 30 * 60000));
  q.finish(job.id, { result: { ok: true } }, new Date(later.getTime() + 30 * 60000));
  expect(q.get(job.id).status).toBe('ok');
  expect(progress.load('completed')).toBeNull();
});

test('failed coordinator confirmation cannot discard checkpoints or partially record a run', () => {
  const job = q.enqueue(task, now);
  const progress = require('./progress').createProgress(db, job.identity);
  progress.save('completed', true);
  q.claim(now);
  db.exec(
    "CREATE TRIGGER fail_confirmation BEFORE UPDATE ON pipeline_jobs WHEN NEW.status='ok' BEGIN SELECT RAISE(ABORT,'interrupted confirmation'); END"
  );
  expect(() => q.finish(job.id, {}, now)).toThrow('interrupted confirmation');
  expect(q.get(job.id).status).toBe('running');
  expect(progress.load('completed')).toBe(true);
  expect(db.prepare('SELECT COUNT(*) AS n FROM pipeline_runs').get().n).toBe(0);
});
test('health distinguishes historical budget backlog from pending current work', () => {
  const yesterday = new Date(now.getTime() - 2 * 86400000);
  q.enqueue({ ...task, historical: true }, yesterday);
  expect(q.status().oldest_pending).toBe(yesterday.toISOString());
  expect(q.status().oldest_pending_recent).toBeNull();
  q.enqueue({ ...task, entity: 8, historical: false }, now);
  expect(q.status().oldest_pending_recent).toBe(now.toISOString());
});
test('checkpoint continuation remains pending without consuming failure attempts or losing time budget', () => {
  const a = q.enqueue({ ...task, historical: true }, now);
  q.claim(now);
  const end = new Date(now.getTime() + 8 * 60000);
  q.finish(a.id, { deferred: true }, end);
  expect(q.get(a.id)).toMatchObject({ status: 'pending', attempts: 0, error: null });
  expect(q.claim(end)).toBeNull();
  expect(q.claim(new Date(end.getTime() + 10000)).id).toBe(a.id);
  expect(db.prepare('SELECT SUM(duration_ms) AS ms FROM pipeline_runs').get().ms).toBe(8 * 60000);
});
test('same entity/stage/content/contract queues exactly once, including after restart', () => {
  const a = q.enqueue(task, now);
  expect(createQueue(db).enqueue(task, now).id).toBe(a.id);
  q.claim(now);
  q.finish(a.id, { result: { ok: true } }, now);
  expect(q.enqueue(task, now).status).toBe('ok');
  expect(q.enqueue({ ...task, hash: 'changed' }, now).id).not.toBe(a.id);
});
test('only one task can be running across coordinators', () => {
  q.enqueue(task, now);
  q.enqueue({ ...task, entity: 8 }, now);
  expect(q.claim(now)).toBeTruthy();
  expect(createQueue(db).claim(now)).toBeNull();
});
test('pause preserves public records and only claims backups', () => {
  q.enqueue(task, now);
  q.enqueue({ kind: 'backup', entity: 'db', hash: 'today', priority: 0 }, now);
  expect(q.claim(now, { paused: true }).kind).toBe('backup');
});
test('transient failures retry at 30m and 2h, never a fourth attempt', () => {
  const a = q.enqueue(task, now);
  let time = now;
  for (const delay of [30 * 60000, 2 * 3600000, 2 * 3600000]) {
    expect(q.claim(time).id).toBe(a.id);
    q.finish(a.id, { error: 'ECONNRESET', transient: true }, time);
    expect(q.claim(time)).toBeNull();
    time = new Date(time.getTime() + delay);
  }
  expect(q.get(a.id).status).toBe('failed');
  expect(q.claim(time)).toBeNull();
});
test('permanent errors never retry without changed input', () => {
  const a = q.enqueue(task, now);
  q.claim(now);
  q.finish(a.id, { error: 'HTTP 403', transient: false }, now);
  expect(q.claim(new Date(now.getTime() + 86400000))).toBeNull();
});
test('interrupted lease resumes without duplicate running work', () => {
  const a = q.enqueue(task, now);
  q.claim(now);
  expect(q.claim(new Date(now.getTime() + 12 * 60000)).id).toBe(a.id);
  expect(q.get(a.id).attempts).toBe(2);
});
test('historical budget cannot delay fresh summaries', () => {
  q.enqueue({ ...task, historical: true }, now);
  const old = q.claim(now);
  q.finish(old.id, {}, new Date(now.getTime() + 3600000));
  q.enqueue({ ...task, entity: 8, historical: true }, now);
  q.enqueue({ ...task, entity: 9, historical: false }, now);
  expect(q.claim(new Date(now.getTime() + 3600000)).entity).toBe('9');
});
test('technical dates do not change signatures or turn old publications into recent', () => {
  expect(hash({ valor: 10, atualizado_em: 'today', nested: { criado_em: 'old' } })).toBe(
    hash({ nested: { criado_em: 'today' }, valor: 10, atualizado_em: 'old' })
  );
  expect(isRecent({ ano: 2025, coletado_em: '2026-09-30', atualizado_em: '2026-09-30' }, now)).toBe(
    false
  );
  expect(isRecent({ ano: 2026, data_publicacao: '2026-09-29' }, now)).toBe(true);
  expect(localTime(new Date('2026-10-01T01:00:00Z')).day).toBe('2026-09-30');
  expect(transientError('maxContentLength size exceeded')).toBe(false);
  expect(transientError('Request timed out.')).toBe(true);
  expect(transientError('404 status code')).toBe(false);
});
test('ten historical documents per local day includes backlog created yesterday', () => {
  for (let i = 0; i < 11; i++) {
    q.enqueue({ ...task, entity: i, historical: true }, new Date(now.getTime() - 86400000));
  }
  for (let i = 0; i < 10; i++) {
    const job = q.claim(now);
    q.finish(job.id, {}, now);
  }
  expect(q.claim(now)).toBeNull();
});
test('historical documents per day is configurable for a catch-up task force', () => {
  const big = createQueue(new DatabaseSync(':memory:'), { historicalDocsPerDay: 3 });
  for (let i = 0; i < 5; i++) {
    big.enqueue({ ...task, entity: i, historical: true }, now);
  }
  for (let i = 0; i < 3; i++) {
    big.finish(big.claim(now).id, {}, now);
  }
  expect(big.claim(now)).toBeNull();
});
test('historical daily time budget is configurable', () => {
  const tiny = createQueue(new DatabaseSync(':memory:'), { historicalBudgetMs: 1 });
  tiny.enqueue({ ...task, entity: 1, historical: true }, now);
  tiny.enqueue({ ...task, entity: 2, historical: true }, now);
  tiny.finish(tiny.claim(now).id, {}, new Date(now.getTime() + 5000));
  expect(tiny.claim(new Date(now.getTime() + 6000))).toBeNull();
});
test('retries consume the historical time budget instead of resetting it', () => {
  const job = q.enqueue({ ...task, historical: true }, now);
  q.claim(now);
  q.finish(job.id, { error: 'ECONNRESET', transient: true }, new Date(now.getTime() + 25 * 60000));
  const later = new Date(now.getTime() + 60 * 60000);
  q.claim(later);
  q.finish(
    job.id,
    { error: 'ECONNRESET', transient: true },
    new Date(later.getTime() + 25 * 60000)
  );
  q.enqueue({ ...task, entity: 8, historical: true }, later);
  expect(q.claim(new Date(later.getTime() + 3 * 3600000))).toBeNull();
});

test('status separates retry backoff and historical budget waits from stalled current work', () => {
  const old = new Date(now.getTime() - 3 * 86400000);
  const backoff = q.enqueue({ ...task, entity: 21, historical: false }, old);
  db.prepare('UPDATE pipeline_jobs SET available_at=? WHERE id=?').run(
    new Date(now.getTime() + 3600000).toISOString(),
    backoff.id
  );
  q.enqueue({ ...task, entity: 22, historical: true }, old);
  const status = q.status(now);
  expect(status.waiting).toEqual({ retry: 1, historical_budget: 1, ready_recent: 0 });
  expect(status.oldest_pending_recent).toBeNull();
  q.enqueue({ ...task, entity: 23, historical: false }, old);
  expect(q.status(now).waiting.ready_recent).toBe(1);
  expect(q.status(now).oldest_pending_recent).toBe(old.toISOString());
});
