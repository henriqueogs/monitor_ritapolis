'use strict';
const { DatabaseSync } = require('node:sqlite');
const crypto = require('node:crypto');
let mockDb;
const mockFetchPncp = jest.fn();
jest.mock('../src/db', () => ({ get db() { return mockDb; } }));
jest.mock('../src/storage/daily-snapshot', () => ({ guardReport: jest.fn(() => ({ paused: false })) }));
jest.mock('../src/coletores/pncp', () => class Collector { fetchJson(...args) { return mockFetchPncp(...args); } });
const config = require('../src/config');
const { createQueue, ITEMS_JOB_CAP_MS } = require('../src/pipeline/queue');
let queue, main, validateInput, assertSafety;
beforeEach(() => {
  mockDb = new DatabaseSync(':memory:');
  queue = createQueue(mockDb);
  mockDb.exec("CREATE TABLE documentos(id INTEGER PRIMARY KEY,texto_completo TEXT); INSERT INTO documentos VALUES(992,'Texto oficial')");
  queue.setMeta('backup', { confirmedAt: new Date().toISOString() });
  mockFetchPncp.mockReset();
  jest.isolateModules(() => { ({ main, validateInput, assertSafety } = require('../scripts/recover-failed-jobs')); });
});
afterEach(() => { mockDb.close(); jest.restoreAllMocks(); });

test('summary recovery checks text hash, contract and payload against the selected entity', () => {
  const job = { kind: 'summary', entity: '992', payload: '{"documentoId":992}',
    input_hash: crypto.createHash('sha256').update('Texto oficial').digest('hex'),
    version: `${config.aiContractVersion}:resume-1` };
  expect(validateInput(job)).toBe(true);
  expect(validateInput({ ...job, payload: '{"documentoId":993}' })).toBe(false);
  expect(validateInput({ ...job, version: 'old' })).toBe(false);
  mockDb.prepare('UPDATE documentos SET texto_completo=?').run('Nova fonte');
  expect(validateInput(job)).toBe(false);
});

test('items above the cumulative cap are refused before calling the AI input layer', () => {
  const job = queue.enqueue({ kind: 'items', entity: 992, hash: 'x', historical: true, payload: { documentoId: 992 } });
  mockDb.prepare(`INSERT INTO pipeline_runs(job_id,kind,entity,historical,finished_at,duration_ms,ok)
    VALUES(?,'items','992',1,?,?,0)`).run(job.id, new Date().toISOString(), config.pipelineHistoricalItemsJobCapMs ?? ITEMS_JOB_CAP_MS);
  expect(validateInput(job)).toBe('items_job_cap_exhausted');
});

test('expired backup and paused R2 guard block recovery', () => {
  assertSafety();
  queue.setMeta('backup', { confirmedAt: '2000-01-01T00:00:00Z' });
  expect(assertSafety).toThrow(/backup/);
  queue.setMeta('backup', { confirmedAt: new Date().toISOString() });
  require('../src/storage/daily-snapshot').guardReport.mockReturnValueOnce({ paused: true });
  expect(assertSafety).toThrow(/Guard/);
});

test('PNCP recovery refuses a still-blocked source before mutating the queue', async () => {
  const job = queue.enqueue({ kind: 'collection', entity: 'pncp', hash: 'week' });
  mockDb.prepare("UPDATE pipeline_jobs SET status='failed',error='PNCP HTTP 403',attempts=1 WHERE id=?").run(job.id);
  const argv = process.argv;
  process.argv = ['node', 'repair', `--job-ids=${job.id}`, '--reason=Fonte acessivel novamente', '--apply'];
  try {
    mockFetchPncp.mockRejectedValueOnce(new Error('PNCP HTTP 403'));
    await expect(main()).rejects.toThrow('PNCP HTTP 403');
    expect(queue.get(job.id).status).toBe('failed');
    mockFetchPncp.mockResolvedValueOnce(null); // readable endpoint, no purchase for this year
    const output = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await main();
    expect(JSON.parse(output.mock.calls[0][0]).changes).toHaveLength(1);
    expect(queue.get(job.id)).toMatchObject({ status: 'pending', attempts: 1 });
  } finally { process.argv = argv; }
});
