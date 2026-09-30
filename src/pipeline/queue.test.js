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
