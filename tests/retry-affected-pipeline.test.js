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
afterEach(() => {
  realClose();
  jest.restoreAllMocks();
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
