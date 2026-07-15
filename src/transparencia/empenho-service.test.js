'use strict';

jest.mock('../db/transparencia-agregados-repo', () => ({
  getDespesaById: jest.fn(),
  getResumoRelacionados: jest.fn(),
  getResumoCategoriaAno: jest.fn(),
}));

const repo = require('../db/transparencia-agregados-repo');
const { getEmpenhoDossie } = require('./empenho-service');

const despesaBase = {
  id: 42,
  exercicio_orcamento: 2026,
  empenho: '02119-000',
  tipo: 'EO - Empenho Ordinário',
  data_empenho: '2026-06-25',
  data_liquidacao: '2026-06-25',
  data_pagamento: '2026-06-25',
  credor_nome: 'APAE',
  credor_cnpj: '01991246000135',
  valor: 220719.13,
  categoria_economica: '3.3.50.43.00 - SUBVENÇÕES SOCIAIS',
  unidade: '02.008.001 - FUNDO MUNICIPAL DE SAÚDE',
  funcao: '10 - SAÚDE',
  fonte_recurso: '1.621.000 - SUS ESTADUAL',
  historico: 'REPASSE À APAE',
  documento_id: 7,
  documento_titulo: 'Pregão 1/2026',
  documento_numero: '1/2026',
  finalidade: {
    classe: 'licitacao',
    rotulo: 'Licitação',
    confianca: 0.95,
    evidencias: [{ campo: 'documento_id', valor: '7', motivo: 'empenho vinculado a documento municipal' }],
  },
};

describe('empenho-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    repo.getResumoRelacionados.mockReturnValue({ n: 2, valor_total: 50, exemplos: [] });
    repo.getResumoCategoriaAno.mockReturnValue({ n: 5, valor_total: 900, exemplos: [] });
  });

  it('retorna null quando empenho não existe', () => {
    repo.getDespesaById.mockReturnValue(null);
    expect(getEmpenhoDossie(999)).toBeNull();
  });

  it('compõe categoria cidadã, portal e status de pagamento', () => {
    repo.getDespesaById.mockReturnValue(despesaBase);
    const dossie = getEmpenhoDossie(42);

    expect(dossie.empenho.categoria_cidada).toEqual({
      slug: 'subvencoes',
      rotulo: 'Subvenções a entidades',
      grupo: 'custeio',
    });
    expect(dossie.empenho.status_pagamento).toBe('pago');
    expect(dossie.empenho.finalidade).toBe(despesaBase.finalidade);
    expect(dossie.empenho.portal.especifico).toBe(true);
    expect(dossie.empenho.portal.url).toContain('ID8_DESP=02119000');
    expect(dossie.documento).toEqual({ id: 7, titulo: 'Pregão 1/2026', numero: '1/2026' });
  });

  it('status liquidado_nao_pago quando falta data_pagamento', () => {
    repo.getDespesaById.mockReturnValue({ ...despesaBase, data_pagamento: null });
    expect(getEmpenhoDossie(42).empenho.status_pagamento).toBe('liquidado_nao_pago');
  });

  it('status empenhado quando não liquidado nem pago', () => {
    repo.getDespesaById.mockReturnValue({
      ...despesaBase,
      data_liquidacao: null,
      data_pagamento: null,
    });
    expect(getEmpenhoDossie(42).empenho.status_pagamento).toBe('empenhado');
  });

  it('monta relacionados por credor e por categoria com exercício', () => {
    repo.getDespesaById.mockReturnValue(despesaBase);
    const dossie = getEmpenhoDossie(42);

    expect(repo.getResumoRelacionados).toHaveBeenCalledWith({
      credorCnpj: '01991246000135',
      exercicio: 2026,
      exceptId: 42,
    });
    expect(repo.getResumoCategoriaAno).toHaveBeenCalledWith({
      prefixos: expect.arrayContaining(['3.3.50']),
      exercicio: 2026,
      exceptId: 42,
    });
    expect(dossie.relacionados.mesmo_credor_ano).toMatchObject({ exercicio: 2026, n: 2, valor_total: 50 });
    expect(dossie.relacionados.mesma_categoria_ano).toMatchObject({
      exercicio: 2026,
      slug: 'subvencoes',
      n: 5,
      valor_total: 900,
    });
  });

  it('documento null quando sem vínculo; relacionados de credor null sem CNPJ', () => {
    repo.getDespesaById.mockReturnValue({
      ...despesaBase,
      documento_id: null,
      documento_titulo: null,
      documento_numero: null,
      credor_cnpj: null,
    });
    const dossie = getEmpenhoDossie(42);
    expect(dossie.documento).toBeNull();
    expect(dossie.relacionados.mesmo_credor_ano).toBeNull();
    expect(repo.getResumoRelacionados).not.toHaveBeenCalled();
  });
});
