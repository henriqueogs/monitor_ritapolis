'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');
const { downloadBoundedPdf } = require('./bounded-file');
let dir, file, downloader;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ritapolis-disk-pdf-'));
  file = path.join(dir, 'official.pdf');
  downloader = {
    respeitarDelay: jest.fn(async () => {}),
    http: {
      request: jest.fn(async () => ({
        headers: {},
        data: Readable.from([Buffer.from('%PDF-1.7'), Buffer.from(' official bytes')]),
      })),
    },
  };
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
test('streams exact bytes to one private file with hash and no response buffer', async () => {
  const result = await downloadBoundedPdf(downloader, 'https://official.example/file', file);
  expect(fs.readFileSync(file).toString()).toBe('%PDF-1.7 official bytes');
  expect(result).toMatchObject({ bytes: 23, hash: expect.stringMatching(/^[a-f0-9]{64}$/) });
  expect(downloader.http.request.mock.calls[0][0].responseType).toBe('stream');
  expect(downloader.http.request.mock.calls[0][0].maxContentLength).toBe(128 * 1024 * 1024);
  expect(fs.existsSync(file + '.part')).toBe(false);
});
test.each([{}, { 'content-length': '1000000' }])(
  'unknown or excessive declared size fails closed with no complete file',
  async headers => {
    downloader.http.request.mockImplementation(async () => ({
      headers,
      data: Readable.from([Buffer.from('%PDF-'), Buffer.alloc(20)]),
    }));
    await expect(
      downloadBoundedPdf(downloader, 'https://official.example/file', file, { maxBytes: 10 })
    ).rejects.toThrow('limite de disco');
    expect(fs.existsSync(file)).toBe(false);
    expect(fs.existsSync(file + '.part')).toBe(false);
  }
);
test('HTML or error masquerading as PDF is not retained', async () => {
  downloader.http.request.mockImplementation(async () => ({
    headers: {},
    data: Readable.from([Buffer.from('<html>error</html>')]),
  }));
  await expect(
    downloadBoundedPdf(downloader, 'https://official.example/file', file)
  ).rejects.toThrow('assinatura PDF');
  expect(fs.existsSync(file)).toBe(false);
});
test('private URLs and oversized policy settings are rejected before network', async () => {
  await expect(downloadBoundedPdf(downloader, 'https://127.0.0.1/file', file)).rejects.toThrow(
    'privado'
  );
  await expect(
    downloadBoundedPdf(downloader, 'https://official.example/file', file, { maxBytes: 1e10 })
  ).rejects.toThrow('limite de disco invalido');
  expect(downloader.http.request).not.toHaveBeenCalled();
});
