'use strict';
const mockBuffer = Buffer.from('%PDF-1.7 scan-only official document');
const mockFetch = jest.fn();
jest.mock('../db', () => ({
  getDocumentoById: jest.fn(() => ({ id: 1, url_pdf: 'https://official.example/?Download=79714' })),
  saveDocumento: jest.fn(),
}));
jest.mock(
  '../coletores/base',
  () =>
    class Base {
      buscarComRetry(...args) {
        return mockFetch(...args);
      }
      async baixarBuffer() {
        return mockBuffer;
      }
    }
);
jest.mock('../parsers/document-file', () => ({
  extractOfficialFileText: jest.fn(async () => ({
    text: '',
    pages: 2,
    info: { tipo_arquivo: 'pdf' },
    error: null,
  })),
}));
jest.mock('./large-file-task', () => ({ extractLarge: jest.fn() }));
jest.mock('../parsers/ocr', () => ({
  ocrPdfBuffer: jest.fn(async () => ({
    texto: 'Texto reconhecido do arquivo oficial',
    paginas: 2,
  })),
  encerrarWorker: jest.fn(async () => {}),
}));
const { execute } = require('./tasks');
const parser = require('../parsers/document-file');
const ocr = require('../parsers/ocr');
const api = require('../db');
const job = { kind: 'extract', payload: JSON.stringify({ documentoId: 1 }) };
beforeEach(() => {
  jest.clearAllMocks();
  api.db = new (require('node:sqlite').DatabaseSync)(':memory:');
  require('./queue').createQueue(api.db);
  api.db.exec(
    'CREATE TABLE documentos(id INTEGER PRIMARY KEY, url_pdf TEXT, texto_completo TEXT, hash_conteudo TEXT, atualizado_em TEXT)'
  );
});
afterEach(() => api.db.close());
test('PDF without URL extension enters OCR and persists real extracted text', async () => {
  await execute(job);
  expect(ocr.ocrPdfBuffer).toHaveBeenCalledWith(mockBuffer, { maxPaginas: 2 });
  expect(api.saveDocumento).toHaveBeenCalledWith(
    expect.objectContaining({
      texto_completo: 'Texto reconhecido do arquivo oficial',
      status_coleta: 'ok',
      dados_extras: expect.objectContaining({
        parser_pdf: expect.objectContaining({ erro: null, paginas: 2 }),
      }),
    })
  );
});
test('complete extraction result is retained as exact source evidence', async () => {
  const result = await execute(job);
  expect(result).toMatchObject({
    source_url: 'https://official.example/?Download=79714',
    file_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
    text_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
  });
});
test('already queued verification reuses fresh extraction without another download or canonical UPDATE', async () => {
  const text = 'Texto integral oficial';
  const url = 'https://official.example/original.pdf';
  api.db.prepare('INSERT INTO documentos VALUES(1,?,?,?,NULL)').run(url, text, 'original-hash');
  const queue = require('./queue').createQueue(api.db);
  const prior = queue.enqueue({ kind: 'extract', entity: 1, hash: 'original-hash', version: '3' });
  queue.claim();
  queue.finish(prior.id, {
    result: {
      source_url: url,
      file_hash: 'exact-bytes',
      text_hash: require('../ai/summarize-document').buildTextoHash(text),
    },
  });
  const before = api.db.prepare('SELECT total_changes() AS n').get().n;
  await expect(
    execute({ kind: 'source-check', payload: '{"documentoId":1}' })
  ).resolves.toMatchObject({ unchanged: true, reusedExtraction: true });
  expect(mockFetch).not.toHaveBeenCalled();
  expect(api.db.prepare('SELECT total_changes() AS n').get().n).toBe(before);
  api.db.prepare('UPDATE documentos SET texto_completo=? WHERE id=1').run('Texto mudou');
  mockFetch.mockResolvedValueOnce({ status: 304 });
  await execute({ kind: 'source-check', payload: '{"documentoId":1}' });
  expect(mockFetch).toHaveBeenCalledTimes(1);
});
test('already readable PDF never runs OCR', async () => {
  parser.extractOfficialFileText.mockResolvedValueOnce({ text: 'Texto nativo oficial', pages: 1 });
  await execute(job);
  expect(ocr.ocrPdfBuffer).not.toHaveBeenCalled();
});
test('failed PDF parsing is not published as complete OCR input', async () => {
  parser.extractOfficialFileText.mockResolvedValueOnce({
    text: '',
    pages: 0,
    error: 'PDF invalid',
  });
  await expect(execute(job)).rejects.toThrow('Texto insuficiente');
  expect(api.saveDocumento).not.toHaveBeenCalled();
});

const largeJob = { kind: 'extract', payload: JSON.stringify({ documentoId: 1, largePdf: true }) };
test('large PDF task is refused unless an oversized-file review was recorded', async () => {
  await expect(execute(largeJob)).rejects.toThrow('exige limite anterior');
  expect(require('./large-file-task').extractLarge).not.toHaveBeenCalled();
});
test('large PDF result keeps page coverage, clears the review and removes disk work', async () => {
  const url = 'https://official.example/?Download=79714';
  require('./file-policy')
    .createFilePolicy(api.db)
    .record(url, new Error('maxContentLength size of 52428800 exceeded'));
  const cleanup = jest.fn();
  require('./large-file-task').extractLarge.mockResolvedValue({
    extraction: {
      text: 'Texto integral por paginas',
      pages: 3,
      info: { parser: 'disk-pdf-v1', cobertura: { complete: true, pages: 3, processed_pages: 3 } },
    },
    fileHash: 'a'.repeat(64),
    downloadBytes: 60000000,
    cleanup,
  });
  const result = await execute(largeJob);
  expect(result).toMatchObject({ pages: 3, file_hash: 'a'.repeat(64) });
  expect(api.saveDocumento).toHaveBeenCalledWith(
    expect.objectContaining({
      texto_completo: 'Texto integral por paginas',
      dados_extras: expect.objectContaining({
        parser_pdf: expect.objectContaining({
          cobertura: expect.objectContaining({ complete: true }),
          arquivo_bytes: 60000000,
        }),
      }),
    })
  );
  expect(cleanup).toHaveBeenCalled();
  expect(api.db.prepare('SELECT count(*) AS n FROM pipeline_file_limits').get().n).toBe(0);
});
