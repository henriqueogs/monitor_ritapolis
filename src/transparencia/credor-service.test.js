'use strict';

jest.mock('../db/credores-repo', () => ({
  getCredorProfile: jest.fn(),
}));

const { getCredorProfile } = require('../db/credores-repo');
const { getCredorDossie } = require('./credor-service');

describe('credor-service', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna null quando credor não existe', () => {
    getCredorProfile.mockReturnValue(null);
    expect(getCredorDossie('00000000000000')).toBeNull();
  });

  it('adiciona por_mandato e portal aos empenhos recentes', () => {
    getCredorProfile.mockReturnValue({
      cnpj: '01991246000135',
      nome: 'APAE',
      resumo: { n_empenhos: 3, valor_total: 60 },
      por_ano: [
        { ano: 2024, n_empenhos: 1, valor_total: 10 },
        { ano: 2025, n_empenhos: 1, valor_total: 20 },
        { ano: 2026, n_empenhos: 1, valor_total: 30 },
      ],
      por_funcao: [],
      empenhos_recentes: [
        { empenho: '02119-000', ano: 2026, tipo: 'EO - Empenho Ordinário', valor: 30 },
        { empenho: '00001-000', ano: 2024, tipo: 'OP - Ordem de Pagamento', valor: 10 },
      ],
      licitacoes_ganhas: [],
      perfil_consolidado: null,
    });

    const dossie = getCredorDossie('01991246000135');

    expect(getCredorProfile).toHaveBeenCalledWith('01991246000135');
    expect(dossie.por_mandato).toHaveLength(2);
    expect(dossie.por_mandato[0].mandato).toBe('2025-2028');
    expect(dossie.por_mandato[0].valor_total).toBe(50);
    expect(dossie.por_mandato[1].anos).toEqual([2024]);

    expect(dossie.empenhos_recentes[0].portal.url).toContain('STR_EXR_EXR=2026');
    expect(dossie.empenhos_recentes[0].portal.url).toContain('LG_OP_DESP=N');
    expect(dossie.empenhos_recentes[1].portal.url).toContain('LG_OP_DESP=S');
    expect(dossie.empenhos_recentes[1].portal.url).toContain('ID8_DESP=00001000');

    // campos originais preservados
    expect(dossie.nome).toBe('APAE');
    expect(dossie.resumo.n_empenhos).toBe(3);
  });
});
