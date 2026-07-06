'use strict';

jest.mock('../db/fts-repo', () => ({ searchDocumentos: jest.fn() }));
jest.mock('../db/transparencia-repo', () => ({ getDespesas: jest.fn() }));
jest.mock('../db/credores-repo', () => ({ listCredores: jest.fn() }));

const { searchDocumentos } = require('../db/fts-repo');
const { getDespesas } = require('../db/transparencia-repo');
const { listCredores } = require('../db/credores-repo');
const { buscaUnificada } = require('./busca-unificada');

describe('buscaUnificada', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    searchDocumentos.mockReturnValue({ total: 42, dados: [{ id: 1, titulo: 'Edital merenda' }] });
    getDespesas.mockReturnValue({ total: 118, dados: [{ id: 9, credor_nome: 'X' }] });
    listCredores.mockReturnValue({ total: 3, dados: [{ credor_chave: 'pf-x', credor_nome: 'X' }] });
  });

  it('compõe as 3 seções com total + dados limitados', () => {
    const r = buscaUnificada('merenda');

    expect(r.q).toBe('merenda');
    expect(r.documentos).toEqual({ total: 42, dados: [{ id: 1, titulo: 'Edital merenda' }] });
    expect(r.empenhos).toEqual({ total: 118, dados: [{ id: 9, credor_nome: 'X' }] });
    expect(r.credores).toEqual({ total: 3, dados: [{ credor_chave: 'pf-x', credor_nome: 'X' }] });
  });

  it('propaga q e limite pros 3 índices (busca: pros credores)', () => {
    buscaUnificada('merenda', { limite: 5 });

    expect(searchDocumentos).toHaveBeenCalledWith('merenda', { limite: 5 });
    expect(getDespesas).toHaveBeenCalledWith({ q: 'merenda', limite: 5 });
    expect(listCredores).toHaveBeenCalledWith({ busca: 'merenda', limite: 5 });
  });

  it('seção que lança erro vira vazia sem derrubar as outras', () => {
    getDespesas.mockImplementation(() => { throw new Error('FTS indisponível'); });

    const r = buscaUnificada('merenda');

    expect(r.empenhos).toEqual({ total: 0, dados: [] });
    expect(r.documentos.total).toBe(42);
    expect(r.credores.total).toBe(3);
  });
});
