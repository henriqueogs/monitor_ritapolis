'use strict';
const mockBuffer = Buffer.from('%PDF-1.7 scan-only official document');
jest.mock('../db', () => ({
  getDocumentoById: jest.fn(() => ({ id: 1, url_pdf: 'https://official.example/?Download=79714' })),
  saveDocumento: jest.fn(),
}));
jest.mock(
  '../coletores/base',
  () =>
    class Base {
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
beforeEach(() => jest.clearAllMocks());
test('PDF without URL extension enters OCR and persists real extracted text', async () => {
  await execute(job);
  expect(ocr.ocrPdfBuffer).toHaveBeenCalledWith(mockBuffer, { maxPaginas: 2 });
  expect(api.saveDocumento).toHaveBeenCalledWith(
    expect.objectContaining({ texto_completo: 'Texto reconhecido do arquivo oficial' })
  );
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
