'use strict';
const { DatabaseSync } = require('node:sqlite');
jest.mock('../config', () => ({
  ...jest.requireActual('../config'),
  aiSummaryEnabled: true,
  aiChunkSizeChars: 1500,
  aiChunkOverlapChars: 0,
  aiMaxCharsDirect: 100,
  aiMaxChunksPerDocument: 100,
}));
jest.mock('../db', () => ({
  getDocumentoById: jest.fn(),
  getResumoAiByDocumentoHash: jest.fn(),
  saveResumoAi: jest.fn(),
}));
const api = require('../db');
const { summarizeDocument } = require('./summarize-document');
const { createProgress, PipelineYield } = require('../pipeline/progress');
let db, provider;
const summary = {
  tipo_documento: 'lei',
  titulo_curto: 'Lei municipal',
  resumo_cidadao: 'Conteudo oficial resumido.',
  resumo_tecnico: 'Conteudo tecnico verificado.',
  objeto: { descricao: 'Objeto oficial', trecho_fonte: 'Trecho oficial' },
  confianca: 0.8,
};
beforeEach(() => {
  jest.clearAllMocks();
  db = new DatabaseSync(':memory:');
  api.getDocumentoById.mockReturnValue({
    id: 7,
    titulo: 'Lei',
    texto_completo: 'Texto oficial municipal. '.repeat(140),
  });
  api.getResumoAiByDocumentoHash.mockReturnValue(null);
  api.saveResumoAi.mockImplementation(input => ({
    ...input,
    criado_em: 'now',
    atualizado_em: 'now',
  }));
  provider = {
    provider: 'test',
    model: 'accurate-model',
    generateJson: jest.fn(async () => JSON.stringify(summary)),
  };
});
afterEach(() => db.close());
test('restart resumes validated chunks and publishes only after full coverage and consolidation', async () => {
  const progress = createProgress(db, 'job');
  let stop = false;
  progress.checkTime = () => {
    if (stop) {
      throw new PipelineYield();
    }
  };
  provider.generateJson.mockImplementationOnce(async () => {
    stop = true;
    return JSON.stringify(summary);
  });
  await expect(summarizeDocument(7, { provider, progress })).rejects.toMatchObject({
    code: 'PIPELINE_YIELD',
  });
  expect(provider.generateJson).toHaveBeenCalledTimes(1);
  expect(api.saveResumoAi).not.toHaveBeenCalled();
  await summarizeDocument(7, { provider, progress: createProgress(db, 'job') });
  // 3360 chars: 3 chunks plus consolidation, and the first chunk is reused.
  expect(provider.generateJson).toHaveBeenCalledTimes(4);
  expect(api.saveResumoAi).toHaveBeenCalledTimes(1);
  expect(api.saveResumoAi.mock.calls[0][0].status).toBe('ok');
});
test('provider failure preserves completed chunks; different model does not inherit them', async () => {
  provider.generateJson
    .mockResolvedValueOnce(JSON.stringify(summary))
    .mockRejectedValueOnce(new Error('404 status code'));
  await expect(
    summarizeDocument(7, { provider, progress: createProgress(db, 'job') })
  ).rejects.toThrow('404');
  const previousRequest = provider.generateJson.mock.calls[0][0].prompt;
  provider.model = 'different-model';
  provider.generateJson.mockClear();
  await summarizeDocument(7, { provider, progress: createProgress(db, 'job') });
  expect(provider.generateJson).toHaveBeenCalledTimes(4);
  expect(provider.generateJson.mock.calls[0][0].prompt).toBe(previousRequest);
});
test('changed source bytes do not reuse checkpoints and valid current summary is never regenerated', async () => {
  const progress = createProgress(db, 'job');
  await summarizeDocument(7, { provider, progress });
  const previousCalls = provider.generateJson.mock.calls.length;
  api.getDocumentoById.mockReturnValue({
    id: 7,
    texto_completo: 'Outro texto oficial. '.repeat(170),
  });
  await summarizeDocument(7, { provider, progress });
  expect(provider.generateJson.mock.calls.length).toBeGreaterThan(previousCalls);
  provider.generateJson.mockClear();
  api.getResumoAiByDocumentoHash.mockReturnValue({ status: 'ok', resumo_json: summary });
  const result = await summarizeDocument(7, { provider, progress });
  expect(result.reutilizado).toBe(true);
  expect(provider.generateJson).not.toHaveBeenCalled();
});
