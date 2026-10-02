'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const mockRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'large-task-'));
jest.mock('../config', () => ({ dbPath: require('node:path').join(mockRoot, 'db.sqlite') }));
jest.mock('../http/bounded-file', () => ({
  downloadBoundedPdf: jest.fn(),
  MAX_DISK_PDF_BYTES: 128 * 1024 * 1024,
}));
jest.mock('../parsers/large-pdf', () => ({ extractLargePdfFile: jest.fn() }));
jest.mock('../parsers/ocr', () => ({ ocrPdfFilePage: jest.fn(), encerrarWorker: jest.fn(async () => {}) }));
const { downloadBoundedPdf } = require('../http/bounded-file');
const { extractLargePdfFile } = require('../parsers/large-pdf');
const { extractLarge } = require('./large-file-task');
const { createProgress } = require('./progress');
const content = Buffer.from('%PDF-1.7 official bytes');
const digest = crypto.createHash('sha256').update(content).digest('hex');
let progress;
beforeEach(() => {
  jest.clearAllMocks();
  progress = createProgress(new DatabaseSync(':memory:'), 'extract:1');
  downloadBoundedPdf.mockImplementation(async (_d, _u, destination) => {
    fs.writeFileSync(destination, content);
    return { bytes: content.length, hash: digest, fetchedAt: new Date().toISOString() };
  });
  extractLargePdfFile.mockResolvedValue({ text: 'ok', pages: 1, info: {} });
});
afterAll(() => fs.rmSync(mockRoot, { recursive: true, force: true }));
const target = { id: 1, hash_conteudo: 'h' };
const run = () => extractLarge(target, 'https://official.example/big.pdf', progress, { downloader: {} });
test('resume reuses the verified file instead of downloading it again', async () => {
  await run();
  await run();
  expect(downloadBoundedPdf).toHaveBeenCalledTimes(1);
  expect(extractLargePdfFile).toHaveBeenCalledTimes(2);
  expect(extractLargePdfFile).toHaveBeenLastCalledWith(
    expect.stringContaining('official.pdf'),
    expect.objectContaining({ fileHash: digest, progress })
  );
});
test('a corrupted or missing working file forces a fresh download', async () => {
  const first = await run();
  const file = extractLargePdfFile.mock.calls[0][0];
  fs.writeFileSync(file, 'tampered');
  await run();
  expect(downloadBoundedPdf).toHaveBeenCalledTimes(2);
  first.cleanup();
});
test('cleanup removes the disk copy and its work directory', async () => {
  const result = await run();
  const file = extractLargePdfFile.mock.calls[0][0];
  result.cleanup();
  expect(fs.existsSync(file)).toBe(false);
  expect(fs.existsSync(path.dirname(file))).toBe(false);
});
test('requires a progress namespace so work is never shared between jobs', async () => {
  await expect(extractLarge(target, 'u', {}, { downloader: {} })).rejects.toThrow('namespace');
});
