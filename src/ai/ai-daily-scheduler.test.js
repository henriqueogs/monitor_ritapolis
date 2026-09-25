'use strict';

jest.mock('./summarize-pending-documents', () => ({
  summarizePendingDocuments: jest.fn().mockResolvedValue({ total_selecionados: 1, total_ok: 0, total_erro: 0 }),
}));
jest.mock('./extract-entities', () => ({ extractEntitiesFromResumes: jest.fn() }));
jest.mock('../alertas/alert-generator', () => ({ generateAlerts: jest.fn() }));
jest.mock('./enfileirar-itens-pendentes', () => ({
  enfileirarItensPendentes: jest.fn().mockResolvedValue({ enfileirados: [] }),
}));
jest.mock('./itens-processo-job-worker', () => ({ runPendingItensEstruturacaoJobs: jest.fn() }));

const { summarizePendingDocuments } = require('./summarize-pending-documents');
const schedulerLock = require('../coletas/scheduler-lock');
const scheduler = require('./ai-daily-scheduler');

const MIN = 60 * 1000;

async function avancar(ms) {
  await jest.advanceTimersByTimeAsync(ms);
}

describe('ai-daily-scheduler', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-09-25T12:00:00Z') });
    summarizePendingDocuments.mockClear();
    scheduler.resetForTests();
    schedulerLock.release(schedulerLock.getDono());
  });

  afterEach(() => {
    scheduler.resetForTests();
    schedulerLock.release(schedulerLock.getDono());
    jest.useRealTimers();
  });

  it('com a trava ocupada no boot, tenta de novo em ~15 min (não espera 4h)', async () => {
    schedulerLock.tryAcquire('coleta');
    scheduler.start();

    await avancar(3 * MIN + 1000); // primeira tentativa: trava ocupada
    expect(summarizePendingDocuments).not.toHaveBeenCalled();

    schedulerLock.release('coleta');
    await avancar(15 * MIN);
    expect(summarizePendingDocuments).toHaveBeenCalledTimes(1);
  });

  it('depois de um ciclo, não repete antes do intervalo configurado', async () => {
    scheduler.start();
    await avancar(3 * MIN + 1000);
    expect(summarizePendingDocuments).toHaveBeenCalledTimes(1);

    await avancar(60 * MIN); // 4 checagens de 15 min, intervalo (4h) não passou
    expect(summarizePendingDocuments).toHaveBeenCalledTimes(1);
  });
});
