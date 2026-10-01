'use strict';
const { DatabaseSync } = require('node:sqlite');
const { createProgress, PipelineYield } = require('../pipeline/progress');
jest.mock('../db', () => ({
  createColetaLog: jest.fn(() => 1),
  finishColetaLog: jest.fn(),
  saveDocumento: jest.fn(),
}));
jest.mock('../db/transparencia-repo', () => ({
  getColetaLog: jest.fn(),
  upsertColetaLog: jest.fn(),
  crosswalkDespesasDocumentos: jest.fn(() => 0),
  enriquecerDetalhesComEmpenhos: jest.fn(() => 0),
}));
jest.mock('./folha-thread-http', () => ({ coletarFolhaExercicioViaThread: jest.fn() }));
const { getColetaLog, upsertColetaLog } = require('../db/transparencia-repo');
const { coletarFolhaExercicioViaThread } = require('./folha-thread-http');
const Folha = require('./folha');
const Portal = require('./portal-transparencia');
let db;
beforeEach(() => {
  jest.clearAllMocks();
  db = new DatabaseSync(':memory:');
});
afterEach(() => {
  db.close();
  jest.useRealTimers();
});

test('payroll keeps the original year plan and does not recount a completed year after voluntary yield', async () => {
  const progress = createProgress(db, 'payroll-job');
  progress.save('payroll-years', [2026, 2025]);
  let yieldOnce = true;
  coletarFolhaExercicioViaThread.mockImplementation(async ano => {
    if (ano === 2025 && yieldOnce) {
      yieldOnce = false;
      throw new PipelineYield();
    }
    return { novos: 2, atualizados: 1, semAlteracao: 3, registros: 6 };
  });
  const first = new Folha();
  first.progress = progress;
  await expect(first.run()).rejects.toMatchObject({ code: 'PIPELINE_YIELD' });
  expect(upsertColetaLog.mock.calls.some(([log]) => log.status === 'erro')).toBe(false);
  // Even if a new cadence plan would now skip 2026, resume uses its exact plan.
  getColetaLog.mockReturnValue({ status: 'ok', coletado_em: new Date().toISOString() });
  const restarted = new Folha();
  restarted.progress = createProgress(db, 'payroll-job');
  const result = await restarted.run();
  expect(result).toMatchObject({
    status: 'ok',
    itens_novos: 4,
    itens_atualizados: 2,
    itens_sem_alteracao: 6,
    itens_com_erro: 0,
  });
  expect(coletarFolhaExercicioViaThread.mock.calls.map(([ano]) => ano)).toEqual([2026, 2025, 2025]);
  expect(upsertColetaLog).toHaveBeenCalledTimes(2);
  expect(coletarFolhaExercicioViaThread.mock.calls.every(([, options]) => options.progress)).toBe(
    true
  );
});

test('legacy financial collection resumes completed windows and cumulative stats, not every year', async () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-12-31T20:00:00Z'));
  const progress = createProgress(db, 'financial-job');
  const year = new Date().getUTCFullYear();
  progress.save('financial-years', {
    through: `${year}-01-14`,
    despesas: [year],
    receitas: [year],
  });
  let yieldOnce = true;
  const collect = jest.fn(async (_ano, ini) => {
    if (ini.endsWith('01-08') && yieldOnce) {
      yieldOnce = false;
      throw new PipelineYield();
    }
    return { novos: 2, atualizados: 1, semAlteracao: 3, registros: 6 };
  });
  const revenue = jest.fn(async () => ({
    novos: 1,
    atualizados: 0,
    semAlteracao: 0,
    registros: 1,
  }));
  const make = () => {
    const c = new Portal();
    c.progress = createProgress(db, 'financial-job');
    c.coletarDespesasJanela = collect;
    c.coletarReceitas = revenue;
    return c;
  };
  await expect(make().run()).rejects.toMatchObject({ code: 'PIPELINE_YIELD' });
  expect(upsertColetaLog).not.toHaveBeenCalled();
  jest.setSystemTime(new Date('2027-01-01T20:00:00Z'));
  const result = await make().run();
  expect(result).toMatchObject({
    status: 'ok',
    itens_novos: 5,
    itens_atualizados: 2,
    itens_sem_alteracao: 6,
    itens_com_erro: 0,
  });
  expect(collect.mock.calls.map(([, ini]) => ini)).toEqual([
    `${year}-01-01`,
    `${year}-01-08`,
    `${year}-01-08`,
  ]);
  expect(revenue).toHaveBeenCalledTimes(1);
});
