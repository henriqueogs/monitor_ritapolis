'use strict';

const mockGetPainelCidadao = jest.fn(() => ({ fontes: [] }));
const mockGetEstatisticas = jest.fn(() => ({ totalDocumentos: 1 }));
const mockGetInteligenciaPanorama = jest.fn(() => ({ totalLicitacoes: 1 }));
const mockGetCoberturaPorAno = jest.fn(() => [{ ano: 2026 }]);

const mockGetPainelTransparencia = jest.fn(() => ({}));
const mockGetGastosPanorama = jest.fn(() => ({}));

jest.mock('../db', () => ({
  getPainelCidadao: (...args) => mockGetPainelCidadao(...args),
  getEstatisticas: (...args) => mockGetEstatisticas(...args),
  getInteligenciaPanorama: (...args) => mockGetInteligenciaPanorama(...args),
  getCoberturaPorAno: (...args) => mockGetCoberturaPorAno(...args)
}));

jest.mock('../transparencia/painel-service', () => ({
  getPainelTransparencia: (...args) => mockGetPainelTransparencia(...args)
}));

jest.mock('../transparencia/gastos-service', () => ({
  getGastosPanorama: (...args) => mockGetGastosPanorama(...args)
}));

const { invalidarTodos } = require('../services/cache-registry');
const {
  getPainelCidadao,
  getEstatisticas,
  getInteligenciaPanorama,
  getCoberturaPorAno,
  warmUpAgregados
} = require('./painel-cidadao-service');

describe('painel-cidadao-service (memoizacao dos agregados do monolito)', () => {
  it('cacheia getPainelCidadao ate invalidarTodos()', () => {
    getPainelCidadao();
    getPainelCidadao();
    expect(mockGetPainelCidadao).toHaveBeenCalledTimes(1);

    invalidarTodos();
    getPainelCidadao();
    expect(mockGetPainelCidadao).toHaveBeenCalledTimes(2);
  });

  it('cacheia getEstatisticas ate invalidarTodos()', () => {
    getEstatisticas();
    getEstatisticas();
    expect(mockGetEstatisticas).toHaveBeenCalledTimes(1);

    invalidarTodos();
    getEstatisticas();
    expect(mockGetEstatisticas).toHaveBeenCalledTimes(2);
  });

  it('cacheia getInteligenciaPanorama ate invalidarTodos()', () => {
    getInteligenciaPanorama();
    getInteligenciaPanorama();
    expect(mockGetInteligenciaPanorama).toHaveBeenCalledTimes(1);

    invalidarTodos();
    getInteligenciaPanorama();
    expect(mockGetInteligenciaPanorama).toHaveBeenCalledTimes(2);
  });

  it('cacheia getCoberturaPorAno ate invalidarTodos()', () => {
    getCoberturaPorAno();
    getCoberturaPorAno();
    expect(mockGetCoberturaPorAno).toHaveBeenCalledTimes(1);

    invalidarTodos();
    getCoberturaPorAno();
    expect(mockGetCoberturaPorAno).toHaveBeenCalledTimes(2);
  });

  it('warmUpAgregados() popula o cache de todos os agregados de uma vez', () => {
    invalidarTodos();
    jest.clearAllMocks();

    warmUpAgregados();

    expect(mockGetPainelCidadao).toHaveBeenCalledTimes(1);
    expect(mockGetEstatisticas).toHaveBeenCalledTimes(1);
    expect(mockGetInteligenciaPanorama).toHaveBeenCalledTimes(1);
    expect(mockGetCoberturaPorAno).toHaveBeenCalledTimes(1);
    expect(mockGetPainelTransparencia).toHaveBeenCalledTimes(1);
    expect(mockGetGastosPanorama).toHaveBeenCalledTimes(1);

    // segunda chamada de warmUpAgregados dentro do TTL nao deve recomputar
    warmUpAgregados();
    expect(mockGetPainelCidadao).toHaveBeenCalledTimes(1);
  });
});
