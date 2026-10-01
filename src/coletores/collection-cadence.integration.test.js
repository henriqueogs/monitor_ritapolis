'use strict';
jest.mock('../config', () => ({ transparenciaAnoInicio: 2019, folhaAnoInicio: 2013,
  dailySchedulerTransparenciaIntervalHoras: 24 }));
jest.mock('../logger', () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn() }));
jest.mock('./base', () => class {
  constructor() { this.http = { defaults: {} }; }
  registrarErroItem() {}
  completeItem() {}
});
jest.mock('../db/transparencia-repo', () => ({ getColetaLog: jest.fn(), upsertColetaLog: jest.fn(),
  crosswalkDespesasDocumentos: jest.fn(() => 0), enriquecerDetalhesComEmpenhos: jest.fn(() => 0) }));
jest.mock('./portal-transparencia-thread-http', () => ({ coletarDespesasJanelaViaThread: jest.fn() }));
jest.mock('./folha-thread-http', () => ({ coletarFolhaExercicioViaThread: jest.fn(async () =>
  ({ registros: 10, novos: 0, atualizados: 0, semAlteracao: 10 })) }));
const { getColetaLog, upsertColetaLog } = require('../db/transparencia-repo');
const { coletarFolhaExercicioViaThread } = require('./folha-thread-http');
const Portal = require('./portal-transparencia');
const Folha = require('./folha');
const result = () => ({ itens_novos: 0, itens_atualizados: 0, itens_com_erro: 0, detalhes: [] });

describe('collector cadence integration', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-30T10:00:00Z'));
    jest.clearAllMocks();
    getColetaLog.mockReturnValue(null);
  });
  afterEach(() => jest.useRealTimers());
  test('expenses/revenues start with current year, not 2019; unchanged is not updated', async () => {
    const p = new Portal();
    p.gerarJanelas = jest.fn((start, end) => [{ ini: start, fim: end }]);
    p.coletarDespesasJanela = jest.fn(async () => ({ registros: 10, novos: 0, atualizados: 0, semAlteracao: 10 }));
    p.coletarReceitas = jest.fn(async () => ({ registros: 5, novos: 0, atualizados: 0, semAlteracao: 5 }));
    const r = result();
    await p.executar(r);
    expect(p.coletarDespesasJanela.mock.calls.map(([ano]) => ano)).toEqual([2026, 2025]);
    expect(p.coletarReceitas.mock.calls.map(([ano]) => ano)).toEqual([2026, 2025]);
    expect(r.itens_atualizados).toBe(0);
    expect(r.itens_sem_alteracao).toBe(30);
    expect(upsertColetaLog).toHaveBeenCalledWith(expect.objectContaining({ exercicio: 2026, atualizados: 0 }));
  });
  test('fresh data does not invoke the source again after a process restart', async () => {
    getColetaLog.mockReturnValue({ status: 'ok', coletado_em: '2026-09-30 09:00:00' });
    const p = new Portal();
    p.coletarDespesasJanela = jest.fn(); p.coletarReceitas = jest.fn();
    await p.executar(result());
    await new Folha().executar(result());
    expect(p.coletarDespesasJanela).not.toHaveBeenCalled();
    expect(p.coletarReceitas).not.toHaveBeenCalled();
    expect(coletarFolhaExercicioViaThread).not.toHaveBeenCalled();
  });
  test('payroll does not reimport every year back to 2013', async () => {
    const r = result();
    await new Folha().executar(r);
    expect(coletarFolhaExercicioViaThread.mock.calls.map(([ano]) => ano)).toEqual([2026, 2025]);
    expect(r.itens_atualizados).toBe(0); expect(r.itens_sem_alteracao).toBe(20);
  });
});
