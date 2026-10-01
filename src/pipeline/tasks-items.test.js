'use strict';
jest.mock('../db', () => ({ getDocumentoById: jest.fn() }));
jest.mock('../ai/estruturar-itens-processo', () => ({
  ...jest.requireActual('../ai/itens-processo-input'),
  listarAtasDoDocumento: jest.fn(() => []), estruturarItensProcesso: jest.fn(),
}));
const { execute } = require('./tasks');
const { getDocumentoById } = require('../db');
const items = require('../ai/estruturar-itens-processo');
const doc = { id: 1, texto_completo: 'Fonte oficial', url_origem: 'https://official.example/1' };
beforeEach(() => { jest.clearAllMocks(); getDocumentoById.mockReturnValue(doc); });
test('items job passes the existing checkpoint store and uses the complete source identity', async () => {
  const progress = { load: jest.fn() };
  items.estruturarItensProcesso.mockResolvedValue({ id: 9 });
  const job = { kind: 'items', version: items.CONTRACT_VERSION, input_hash: items.computeInputHash(doc, []), payload: '{"documentoId":1}' };
  expect(await execute(job, { progress })).toEqual({ id: 9 });
  expect(items.estruturarItensProcesso).toHaveBeenCalledWith(doc, { progress });
});
test('old operation version or changed source URL does not process or falsely publish stale output', async () => {
  const job = { kind: 'items', version: 'itens-processo-v1.0', input_hash: items.computeInputHash(doc, []), payload: '{"documentoId":1}' };
  expect(await execute(job)).toMatchObject({ skipped: true });
  getDocumentoById.mockReturnValue({ ...doc, url_origem: 'https://official.example/new-source' });
  expect(await execute({ ...job, version: items.CONTRACT_VERSION })).toMatchObject({ skipped: true });
  expect(items.estruturarItensProcesso).not.toHaveBeenCalled();
});
