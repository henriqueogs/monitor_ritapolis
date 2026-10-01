'use strict';

jest.mock('../db/itens-estruturacao-jobs-repo', () => ({
  getNextPendingItensEstruturacaoJob: jest.fn(),
  markItensEstruturacaoJobProcessing: jest.fn(),
  finishItensEstruturacaoJobOk: jest.fn(),
  finishItensEstruturacaoJobError: jest.fn(),
  recoverStaleItensEstruturacaoJobs: jest.fn().mockReturnValue({ recovered: 0 }),
}));
jest.mock('../db/index', () => ({ getDocumentoById: jest.fn() }));
jest.mock('./estruturar-itens-processo', () => ({ estruturarItensProcesso: jest.fn(),
  CONTRACT_VERSION: 'itens-processo-v1.1-full', computeInputHash: () => 'hash', listarAtasDoDocumento: () => [] }));

const repo = require('../db/itens-estruturacao-jobs-repo');
const { getDocumentoById } = require('../db/index');
const { estruturarItensProcesso } = require('./estruturar-itens-processo');
const { runPendingItensEstruturacaoJobs, processJob } = require('./itens-processo-job-worker');

describe('itens-processo-job-worker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    repo.markItensEstruturacaoJobProcessing.mockImplementation((id) => ({ id, documento_id: 5,
      status: 'processando', contrato_versao: 'itens-processo-v1.1-full', texto_hash: 'hash' }));
  });

  it('processa um job pendente até o fim (ok)', async () => {
    repo.getNextPendingItensEstruturacaoJob
      .mockReturnValueOnce({ id: 1, documento_id: 5, status: 'pendente' })
      .mockReturnValueOnce(null);
    repo.markItensEstruturacaoJobProcessing.mockReturnValue({ id: 1, documento_id: 5, status: 'processando', contrato_versao: 'itens-processo-v1.1-full', texto_hash: 'hash' });
    getDocumentoById.mockReturnValue({ id: 5, texto_completo: 'edital' });
    estruturarItensProcesso.mockResolvedValue({ id: 77 });

    await runPendingItensEstruturacaoJobs();

    expect(estruturarItensProcesso).toHaveBeenCalledWith({ id: 5, texto_completo: 'edital' }, { progress: undefined, force: false });
    expect(repo.finishItensEstruturacaoJobOk).toHaveBeenCalledWith(1, 77);
    expect(repo.finishItensEstruturacaoJobError).not.toHaveBeenCalled();
  });

  it('job com erro grava status erro, não derruba o worker', async () => {
    repo.getNextPendingItensEstruturacaoJob
      .mockReturnValueOnce({ id: 2, documento_id: 605, status: 'pendente' })
      .mockReturnValueOnce(null);
    repo.markItensEstruturacaoJobProcessing.mockReturnValue({ id: 2, documento_id: 605, status: 'processando', contrato_versao: 'itens-processo-v1.1-full', texto_hash: 'hash' });
    getDocumentoById.mockReturnValue({ id: 605, texto_completo: 'cronograma' });
    estruturarItensProcesso.mockRejectedValue(new Error('fora do contrato'));

    await expect(runPendingItensEstruturacaoJobs()).resolves.not.toThrow();
    expect(repo.finishItensEstruturacaoJobError).toHaveBeenCalledWith(2, 'fora do contrato');
  });

  it('processa múltiplos jobs em sequência (rate-limit safe: um por vez)', async () => {
    repo.getNextPendingItensEstruturacaoJob
      .mockReturnValueOnce({ id: 1, documento_id: 5, status: 'pendente' })
      .mockReturnValueOnce({ id: 2, documento_id: 6, status: 'pendente' })
      .mockReturnValueOnce(null);
    repo.markItensEstruturacaoJobProcessing.mockImplementation((id) => ({ id, documento_id: 5, status: 'processando', contrato_versao: 'itens-processo-v1.1-full', texto_hash: 'hash' }));
    getDocumentoById.mockReturnValue({ id: 5, texto_completo: 't' });
    estruturarItensProcesso.mockResolvedValue({ id: 1 });

    await runPendingItensEstruturacaoJobs();

    expect(estruturarItensProcesso).toHaveBeenCalledTimes(2);
  });

  it('sem jobs pendentes não chama estruturarItensProcesso', async () => {
    repo.getNextPendingItensEstruturacaoJob.mockReturnValue(null);
    await runPendingItensEstruturacaoJobs();
    expect(estruturarItensProcesso).not.toHaveBeenCalled();
  });
  it('yield preserves the existing job and checkpoints without declaring a failure or success', async () => {
    const progress = { load: jest.fn() };
    getDocumentoById.mockReturnValue({ id: 5, texto_completo: 'Fonte' });
    const error = new Error('continuar'); error.code = 'PIPELINE_YIELD';
    estruturarItensProcesso.mockRejectedValue(error);
    await expect(processJob({ id: 1 }, { progress })).rejects.toBe(error);
    expect(repo.finishItensEstruturacaoJobError).not.toHaveBeenCalled();
    expect(repo.finishItensEstruturacaoJobOk).not.toHaveBeenCalled();
  });

  it('job travado (markProcessing retorna status != processando) é ignorado', async () => {
    repo.getNextPendingItensEstruturacaoJob
      .mockReturnValueOnce({ id: 3, documento_id: 5, status: 'pendente' })
      .mockReturnValueOnce(null);
    repo.markItensEstruturacaoJobProcessing.mockReturnValue({ id: 3, status: 'ok' }); // já processado por outro worker
    await runPendingItensEstruturacaoJobs();
    expect(estruturarItensProcesso).not.toHaveBeenCalled();
  });
});
