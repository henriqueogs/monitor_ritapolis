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
const config = require('../config');
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
test('adaptive direct fallback resumes chunks without repeating the failed direct request', async () => {
  const previous = {
    aiMaxCharsDirect: config.aiMaxCharsDirect,
    aiChunkSizeChars: config.aiChunkSizeChars,
    aiRetryMax: config.aiRetryMax,
  };
  Object.assign(config, { aiMaxCharsDirect: 5000, aiChunkSizeChars: 5000, aiRetryMax: 0 });
  try {
    const progress = createProgress(db, 'adaptive');
    let stopped = false;
    progress.checkTime = () => {
      if (stopped) {
        throw new PipelineYield();
      }
    };
    provider.generateJson
      .mockRejectedValueOnce(new Error('Request timed out'))
      .mockImplementationOnce(async () => {
        stopped = true;
        return JSON.stringify(summary);
      });
    await expect(summarizeDocument(7, { provider, progress })).rejects.toMatchObject({
      code: 'PIPELINE_YIELD',
    });
    expect(api.saveResumoAi).not.toHaveBeenCalled();
    const failedDirectPrompt = provider.generateJson.mock.calls[0][0].prompt;
    provider.generateJson.mockClear();
    await summarizeDocument(7, { provider, progress: createProgress(db, 'adaptive') });
    expect(
      provider.generateJson.mock.calls.every(([request]) => request.prompt !== failedDirectPrompt)
    ).toBe(true);
    expect(provider.generateJson).toHaveBeenCalledTimes(2); // unfinished chunk and consolidation
    expect(api.saveResumoAi).toHaveBeenCalledTimes(1);
  } finally {
    Object.assign(config, previous);
  }
});
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

test('deadline-clipped timeout resumes the same chunk, without error rows or needless splits', async () => {
  jest.useFakeTimers();
  try {
    const progress = createProgress(db, 'deadline', { deadline: Date.now() + 60000 });
    provider.generateJson.mockImplementationOnce(async ({ timeoutMs }) => {
      jest.advanceTimersByTime(timeoutMs);
      throw new Error('Request timed out.');
    });
    await expect(summarizeDocument(7, { provider, progress })).rejects.toMatchObject({
      code: 'PIPELINE_YIELD',
    });
    expect(api.saveResumoAi).not.toHaveBeenCalled();
    expect(db.prepare('SELECT COUNT(*) AS n FROM pipeline_progress').get().n).toBe(0);
    const unfinishedPrompt = provider.generateJson.mock.calls[0][0].prompt;
    await summarizeDocument(7, { provider, progress: createProgress(db, 'deadline') });
    expect(provider.generateJson.mock.calls[1][0].prompt).toBe(unfinishedPrompt);
    expect(api.saveResumoAi).toHaveBeenCalledTimes(1);
    expect(api.saveResumoAi.mock.calls[0][0].status).toBe('ok');
  } finally {
    jest.useRealTimers();
  }
});

test('consolidation and deterministic fallback preserve null instead of inventing zero prices', async () => {
  const partial = {
    ...summary,
    itens_licitados: [
      {
        descricao: 'Arroz',
        trecho_fonte: 'Arroz',
        quantidade: null,
        valor_unitario_estimado: null,
        valor_total_final: 2,
      },
    ],
  };
  provider.generateJson.mockImplementation(async ({ prompt }) => {
    if (prompt.includes('Resumos parciais:')) {
      const payload = JSON.parse(prompt.split('Resumos parciais:\n"""\n')[1].split('\n"""')[0]);
      expect(payload[0].itens_licitados[0]).toMatchObject({
        quantidade: null,
        valor_unitario_estimado: null,
        valor_total_final: 2,
      });
      throw new Error('Request timed out.');
    }
    return JSON.stringify(partial);
  });
  const result = await summarizeDocument(7, { provider, progress: createProgress(db, 'nulls') });
  expect(result.resumo.itens_licitados[0]).toMatchObject({
    quantidade: null,
    valor_unitario_estimado: null,
    valor_total_final: 2,
  });
});

test('source changed during generation is never published with the previous hash', async () => {
  provider.generateJson.mockImplementation(async () => {
    api.getDocumentoById.mockReturnValue({ id: 7, texto_completo: 'Texto modificado' });
    return JSON.stringify(summary);
  });
  await expect(
    summarizeDocument(7, { provider, progress: createProgress(db, 'changed') })
  ).rejects.toThrow('fonte mudou');
  expect(api.saveResumoAi).not.toHaveBeenCalled();
});
