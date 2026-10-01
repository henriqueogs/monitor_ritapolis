'use strict';
jest.mock('tesseract.js', () => ({ createWorker: jest.fn() }));
jest.mock('child_process', () => ({ execFileSync: jest.fn() }));
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { createWorker } = require('tesseract.js');
const { execFileSync } = require('child_process');
const { createProgress } = require('../pipeline/progress');
const ocr = require('./ocr');
let db, worker;
beforeEach(() => {
  jest.clearAllMocks();
  db = new DatabaseSync(':memory:');
  worker = {
    setParameters: jest.fn(),
    recognize: jest.fn(async () => ({
      data: { text: 'Documento oficial publicado pela prefeitura municipal.' },
    })),
    terminate: jest.fn(),
  };
  createWorker.mockResolvedValue(worker);
  execFileSync.mockImplementation((command, args) => {
    fs.writeFileSync(`${args.at(-1)}.png`, 'test image');
  });
});
afterEach(async () => {
  await ocr.encerrarWorker();
  db.close();
});
test('Portuguese best model uses isolated regular SIMD worker without downgrading quality', async () => {
  await ocr.ocrPdfBuffer(Buffer.from('%PDF-original'), {
    maxPaginas: 1,
    progress: createProgress(db, 'doc'),
  });
  expect(createWorker).toHaveBeenCalledWith(
    'por',
    1,
    expect.objectContaining({
      langPath: 'https://tessdata.projectnaptha.com/4.0.0_best',
      workerPath: path.resolve(__dirname, 'ocr-worker.js'),
    })
  );
});
test('resume after worker interruption rasterizes and recognizes only unfinished pages', async () => {
  const buffer = Buffer.from('%PDF-original');
  const progress = createProgress(db, 'doc');
  worker.recognize
    .mockResolvedValueOnce({ data: { text: 'Primeira pagina com texto oficial reconhecido.' } })
    .mockRejectedValueOnce(new Error('interrupted'));
  await expect(ocr.ocrPdfBuffer(buffer, { maxPaginas: 2, progress })).rejects.toThrow(
    'interrupted'
  );
  await ocr.encerrarWorker();
  jest.clearAllMocks();
  const result = await ocr.ocrPdfBuffer(buffer, {
    maxPaginas: 2,
    progress: createProgress(db, 'doc'),
  });
  expect(worker.recognize).toHaveBeenCalledTimes(1);
  expect(execFileSync).toHaveBeenCalledTimes(1);
  expect(execFileSync.mock.calls[0][1]).toContain('2');
  expect(result.texto).toContain('Primeira pagina');
  expect(result.paginas).toBe(2);
});
test('changed file bytes cannot reuse completed OCR of another revision', async () => {
  const progress = createProgress(db, 'doc');
  await ocr.ocrPdfBuffer(Buffer.from('%PDF-old'), { maxPaginas: 1, progress });
  await ocr.ocrPdfBuffer(Buffer.from('%PDF-new'), { maxPaginas: 1, progress });
  expect(worker.recognize).toHaveBeenCalledTimes(2);
});
test('deadline yields before an unfinished page, never returning a partial complete document', async () => {
  await expect(
    ocr.ocrPdfBuffer(Buffer.from('%PDF-original'), {
      maxPaginas: 2,
      progress: createProgress(db, 'doc', { deadline: Date.now() - 1 }),
    })
  ).rejects.toMatchObject({ code: 'PIPELINE_YIELD' });
  expect(worker.recognize).not.toHaveBeenCalled();
});
