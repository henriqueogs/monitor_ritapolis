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

test('anexo-summary recovery checks the attachment text and refuses text the gate still rejects', () => {
  const { buildTextoHash } = require('../src/ai/summarize-document');
  const { getAnexoSummaryVersion } = require('../src/ai/summarize-anexo');
  const texto = 'ATA DE REGISTRO DE PRECOS do pregao presencial. ____________________ Prefeito Municipal';
  mockDb.exec('CREATE TABLE documentos_anexos(id INTEGER PRIMARY KEY,documento_id INTEGER,texto_completo TEXT)');
  mockDb.prepare('INSERT INTO documentos_anexos VALUES(5,992,?)').run(texto);
  const job = { kind: 'anexo-summary', entity: '992', payload: '{"documentoId":992,"anexoId":5}',
    input_hash: buildTextoHash(texto), version: getAnexoSummaryVersion(texto) };

  expect(validateInput(job)).toBe(true);
  expect(validateInput({ ...job, payload: '{"documentoId":992,"anexoId":6}' })).toBe(false);
  expect(validateInput({ ...job, version: 'old' })).toBe(false);
  const lixo = 'ATA texto !@#$%^& ilegivel mas com palavras reais';
  mockDb.prepare('UPDATE documentos_anexos SET texto_completo=?').run(lixo);
  expect(validateInput({ ...job, input_hash: buildTextoHash(lixo), version: getAnexoSummaryVersion(lixo) }))
    .toBe('texto_ainda_reprovado');
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

test('--retomar percorre a categoria inteira e só aplica com --apply', async () => {
  const { buildTextoHash } = require('../src/ai/summarize-document');
  const { getAnexoSummaryVersion } = require('../src/ai/summarize-anexo');
  const texto = 'ATA DE REGISTRO DE PRECOS do pregao presencial. ____________________ Prefeito Municipal';
  mockDb.exec('CREATE TABLE documentos_anexos(id INTEGER PRIMARY KEY,documento_id INTEGER,texto_completo TEXT)');
  mockDb.prepare('INSERT INTO documentos_anexos VALUES(5,992,?)').run(texto);
  const job = queue.enqueue({ kind: 'anexo-summary', entity: 992, hash: buildTextoHash(texto),
    version: getAnexoSummaryVersion(texto), historical: true, payload: { documentoId: 992, anexoId: 5 } });
  mockDb.prepare("UPDATE pipeline_jobs SET status='failed',error='texto_baixa_qualidade_ocr',attempts=1 WHERE id=?").run(job.id);
  const argv = process.argv;
  const output = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
  try {
    process.argv = ['node', 'repair', '--retomar=revisao_fonte', '--reason=Gate de OCR corrigido (#277)'];
    await main();
    expect(JSON.parse(output.mock.calls[0][0])).toMatchObject({ apply: false, retomados: 1 });
    expect(queue.get(job.id).status).toBe('failed');
    process.argv.push('--apply');
    await main();
    expect(queue.get(job.id).status).toBe('pending');
  } finally { process.argv = argv; }
});

test('retomar o proprio backup nao exige backup recente (senao a pausa nunca sai); o guard do R2 continua valendo', () => {
  queue.setMeta('backup', { confirmedAt: new Date(Date.now() - 3 * 24 * 3600000).toISOString() });

  expect(() => assertSafety()).toThrow(/backup/);
  expect(() => assertSafety({ somenteBackup: true })).not.toThrow();
  require('../src/storage/daily-snapshot').guardReport.mockReturnValueOnce({ paused: true });
  expect(() => assertSafety({ somenteBackup: true })).toThrow(/Guard/);
  expect(validateInput({ kind: 'backup', entity: 'database', payload: '{}' })).toBe(true);
});
