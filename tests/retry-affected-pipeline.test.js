'use strict';
const { DatabaseSync } = require('node:sqlite');
let mockDb;
jest.mock('../src/db', () => ({
  get db() {
    return mockDb;
  },
}));
jest.mock('../src/storage/daily-snapshot', () => ({
  guardReport: jest.fn(() => ({ paused: false })),
}));
const { createQueue } = require('../src/pipeline/queue');
const { createProgress } = require('../src/pipeline/progress');
let realClose;
beforeEach(() => {
  mockDb = new DatabaseSync(':memory:');
  realClose = mockDb.close.bind(mockDb);
  jest.spyOn(mockDb, 'close').mockImplementation(() => {});
});

test('janela de deploy retoma somente modulos ausentes/interrupcoes daquela janela, mantendo limites e identidades', () => {
  const q = createQueue(mockDb);
  q.setMeta('backup', { confirmedAt: new Date().toISOString() });
  const from = '2026-10-01T15:13:22.000Z';
  const to = '2026-10-01T15:14:42.000Z';
  const rows = [
    { entity: 'camara_legislacao', error: "Cannot find module 'cheerio'", time: '2026-10-01T15:13:55.180Z', status: 'failed', attempts: 1 },
    { entity: 'legislacao_prefeitura', error: 'worker_interrupted (exit 2)', time: '2026-10-01T15:14:00.000Z', status: 'pending', attempts: 1 },
    { entity: 'site_prefeitura', error: "Cannot find module 'cheerio'", time: '2026-10-01T14:14:00.000Z', status: 'failed', attempts: 1 },
    { entity: 'pncp', error: "Cannot find module 'cheerio'", time: '2026-10-01T15:14:00.000Z', status: 'failed', attempts: 3 },
    { entity: 'unknown', error: 'Erro genuino de validacao', time: '2026-10-01T15:14:00.000Z', status: 'failed', attempts: 1 },
  ];
  for (const row of rows) {
    const j = q.enqueue({ kind: 'collection', entity: row.entity, hash: 'known-input', version: 'source-fix-1' });
    mockDb.prepare('UPDATE pipeline_jobs SET status=?,error=?,finished_at=?,attempts=? WHERE id=?')
      .run(row.status, row.error, row.time, row.attempts, j.id);
    createProgress(mockDb, j.identity).save('completed', true);
  }
  const args = process.argv;
  const output = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
  try {
    process.argv = ['node', 'repair', '--apply', `--deploy-from=${from}`, `--deploy-to=${to}`];
    jest.isolateModules(() => require('../scripts/retry-affected-pipeline'));
    const report = JSON.parse(output.mock.calls[0][0]);
    expect(report.affected).toBe(2);
    expect(mockDb.prepare('SELECT COUNT(*) AS n FROM pipeline_jobs').get().n).toBe(5);
    for (const change of report.changes) {
      expect(change.previousJobId).toBe(change.newJobId);
      const j = q.get(change.newJobId);
      expect(j.status).toBe('pending');
      expect(j.attempts).toBe(1);
      expect(createProgress(mockDb, j.identity).load('completed')).toBe(true);
    }
    expect(q.get(3).status).toBe('failed');
    expect(q.get(4).status).toBe('failed');
    expect(q.get(5).status).toBe('failed');
    process.argv = ['node', 'repair', '--deploy-from=2026-10-01T00:00:00Z', '--deploy-to=2026-10-01T15:00:00Z'];
    expect(() => jest.isolateModules(() => require('../scripts/retry-affected-pipeline'))).toThrow(/Janela de deploy invalida/);
  } finally { process.argv = args; }
});
afterEach(() => {
  realClose();
  jest.restoreAllMocks();
});
test('PNCP ata repair is opt-in, keeps completed checkpoints and never resets attempt limits', () => {
  const queue = createQueue(mockDb);
  queue.setMeta('backup', { confirmedAt: new Date().toISOString() });
  const job = queue.enqueue({ kind: 'collection', entity: 'pncp', hash: '2960', version: 'source-fix-1' });
  const markFailed = (error, attempts = 1) => mockDb.prepare(
    "UPDATE pipeline_jobs SET status='failed',error=?,attempts=? WHERE id=?"
  ).run(error, attempts, job.id);
  markFailed('PNCP: identificador oficial incompleto (ata)');
  createProgress(mockDb, job.identity).save('completed-page', { count: 5 });
  const originalArgs = process.argv;
  const output = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
  const run = args => {
    output.mockClear();
    process.argv = ['node', 'repair', ...args];
    jest.isolateModules(() => require('../scripts/retry-affected-pipeline'));
    return JSON.parse(output.mock.calls[0][0]);
  };
  try {
    expect(run([]).affected).toBe(0);
    expect(run(['--pncp-ata']).affected).toBe(1);
    expect(queue.get(job.id).status).toBe('failed');
    expect(run(['--pncp-ata', '--apply']).changes[0]).toMatchObject({
      previousJobId: job.id, newJobId: job.id, version: 'source-fix-1', resumeExisting: true,
    });
    expect(queue.get(job.id)).toMatchObject({ identity: job.identity, status: 'pending', attempts: 1 });
    expect(createProgress(mockDb, job.identity).load('completed-page')).toEqual({ count: 5 });
    expect(mockDb.prepare('SELECT COUNT(*) AS n FROM pipeline_jobs').get().n).toBe(1);
    markFailed('PNCP: identificador oficial incompleto (ata)', 3);
    expect(run(['--pncp-ata', '--apply']).affected).toBe(0);
    markFailed('PNCP: identificadores oficiais divergentes (sequencialAta)');
    expect(run(['--pncp-ata', '--apply']).affected).toBe(0);
  } finally {
    process.argv = originalArgs;
  }
});
test('selective repair resumes SDK timeout with the same job and validated checkpoints, bounded attempts', () => {
  const queue = createQueue(mockDb);
  queue.setMeta('backup', { confirmedAt: new Date().toISOString() });
  const a = queue.enqueue({
    kind: 'summary',
    entity: 2433,
    hash: 'actual-text',
    version: '1.1:resume-1',
  });
  queue.claim();
  queue.finish(a.id, { error: 'Request timed out.', transient: false });
  createProgress(mockDb, a.identity).save('completed-chunk', { valid: true });
  const originalArgs = process.argv;
  const output = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
  try {
    process.argv = ['node', 'repair', '--apply'];
    jest.isolateModules(() => require('../scripts/retry-affected-pipeline'));
    expect(queue.get(a.id)).toMatchObject({ identity: a.identity, status: 'pending', attempts: 1 });
    expect(createProgress(mockDb, a.identity).load('completed-chunk')).toEqual({ valid: true });
    expect(mockDb.prepare('SELECT COUNT(*) AS n FROM pipeline_jobs').get().n).toBe(1);
    const report = JSON.parse(output.mock.calls[0][0]);
    expect(report.changes[0]).toMatchObject({
      previousJobId: a.id,
      newJobId: a.id,
      resumeExisting: true,
    });
    mockDb
      .prepare(
        "UPDATE pipeline_jobs SET status='failed',attempts=3,error='Request timed out.' WHERE id=?"
      )
      .run(a.id);
    jest.isolateModules(() => require('../scripts/retry-affected-pipeline'));
    expect(queue.get(a.id).status).toBe('failed');
    expect(JSON.parse(output.mock.calls[1][0]).affected).toBe(0);
  } finally {
    process.argv = originalArgs;
  }
});
