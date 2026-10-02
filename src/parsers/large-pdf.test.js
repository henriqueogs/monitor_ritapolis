'use strict';
const { DatabaseSync } = require('node:sqlite');
const { createProgress, PipelineYield } = require('../pipeline/progress');
const { extractLargePdfFile } = require('./large-pdf');
const hash = 'a'.repeat(64);
let db, run;
beforeEach(() => {
  db = new DatabaseSync(':memory:');
  run = jest.fn(async (command, args) =>
    command === 'pdfinfo'
      ? 'Pages: 3\n'
      : `Pagina ${args[2]} com texto oficial municipal completo e legivel.`
  );
});
afterEach(() => db.close());
test('all pages including the final one are read individually with exact coverage', async () => {
  const result = await extractLargePdfFile('official.pdf', {
    fileHash: hash,
    run,
    progress: createProgress(db, 'x'),
  });
  expect(result.text).toContain('Pagina 3');
  expect(result.info.cobertura).toMatchObject({ pages: 3, processed_pages: 3, complete: true });
  expect(run.mock.calls.slice(1).map(c => c[1].slice(0, 5))).toEqual([
    ['-layout', '-f', '1', '-l', '1'],
    ['-layout', '-f', '2', '-l', '2'],
    ['-layout', '-f', '3', '-l', '3'],
  ]);
});
test('yield preserves completed pages and resumes only the unread ones', async () => {
  const progress = createProgress(db, 'x');
  const save = progress.save;
  let stopped = false;
  progress.save = (key, value) => {
    save(key, value);
    if (key.endsWith(':page:1') && !stopped) {
      stopped = true;
      throw new PipelineYield();
    }
  };
  await expect(
    extractLargePdfFile('official.pdf', { fileHash: hash, run, progress })
  ).rejects.toMatchObject({ code: 'PIPELINE_YIELD' });
  run.mockClear();
  const result = await extractLargePdfFile('official.pdf', {
    fileHash: hash,
    run,
    progress: createProgress(db, 'x'),
  });
  expect(run).toHaveBeenCalledTimes(2);
  expect(result.text).toContain('Pagina 1');
});
test('changed official bytes do not inherit pages from a previous revision', async () => {
  const progress = createProgress(db, 'x');
  await extractLargePdfFile('official.pdf', { fileHash: hash, run, progress });
  run.mockClear();
  await extractLargePdfFile('official.pdf', { fileHash: 'b'.repeat(64), run, progress });
  expect(run).toHaveBeenCalledTimes(4);
});
test('OCR is restricted to pages without readable native text, and incomplete OCR cannot be complete', async () => {
  run.mockImplementation(async (command, args) =>
    command === 'pdfinfo'
      ? 'Pages: 3\n'
      : args[2] === '2'
        ? ''
        : `Texto oficial da pagina ${args[2]} reconhecido e legivel.`
  );
  const ocrPage = jest.fn(async () => 'Segunda pagina reconhecida com texto oficial completo.');
  const result = await extractLargePdfFile('official.pdf', {
    fileHash: hash,
    run,
    ocrPage,
    progress: createProgress(db, 'x'),
  });
  expect(ocrPage).toHaveBeenCalledTimes(1);
  expect(ocrPage.mock.calls[0][1]).toBe(2);
  expect(result.info.ocr_pages).toBe(1);
  await expect(
    extractLargePdfFile('official.pdf', { fileHash: 'c'.repeat(64), run })
  ).rejects.toThrow('cobertura incompleta');
});
test('page count outside the finite cap or native failure cannot return a partial complete result', async () => {
  run.mockResolvedValueOnce('Pages: 1001\n');
  await expect(extractLargePdfFile('official.pdf', { fileHash: hash, run })).rejects.toThrow(
    'limite seguro'
  );
  run
    .mockImplementationOnce(async () => 'Pages: 3\n')
    .mockImplementationOnce(async () => {
      throw new Error('parser isolated failed');
    });
  await expect(extractLargePdfFile('official.pdf', { fileHash: hash, run })).rejects.toThrow(
    'parser isolated failed'
  );
});
