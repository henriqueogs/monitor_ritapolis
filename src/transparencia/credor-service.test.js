'use strict';

jest.mock('../db/credores-repo', () => ({
  getCredorProfile: jest.fn(),
  listCredores: jest.fn(),
  getCoberturaCredores: jest.fn(),
}));

const { getCredorProfile, listCredores, getCoberturaCredores } = require('../db/credores-repo');
const { getCredorDossie, listarCredoresDoPeriodo } = require('./credor-service');

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

  it('dossiê destaca o mandato em curso e traz o acumulado como secundário', () => {
    getCredorProfile.mockReturnValue({
      cnpj: '01991246000135',
      nome: 'APAE',
      resumo: { n_empenhos: 2, valor_total: 2000 },
      por_ano: [
        { ano: 2000, n_empenhos: 1, valor_total: 1000, valor_estimado_global: 0 },
        { ano: 2025, n_empenhos: 1, valor_total: 1000, valor_estimado_global: 50 },
      ],
      por_funcao: [],
      empenhos_recentes: [],
      licitacoes_ganhas: [],
      perfil_consolidado: null,
    });

    const dossie = getCredorDossie('01991246000135', { anoAtual: 2026 });

    expect(dossie.destaque).toMatchObject({ mandato: '2025-2028', valor_total: 1000, em_curso: true });
    expect(dossie.acumulado).toMatchObject({ valor_total: 2000, label: '2000–2025' });
    expect(dossie.por_mandato[0].valor_estimado_global).toBe(50);
  });

  describe('listarCredoresDoPeriodo', () => {
    beforeEach(() => {
      listCredores.mockReturnValue({ total: 0, pagina: 1, limite: 50, dados: [] });
      getCoberturaCredores.mockReturnValue({ primeiro: 2019, ultimo: 2026 });
    });

    it('mandato vira os 4 exercícios e o rótulo traz o intervalo', () => {
      const r = listarCredoresDoPeriodo({ mandato: 2026 });

      expect(listCredores).toHaveBeenCalledWith(expect.objectContaining({ exercicios: [2025, 2026, 2027, 2028] }));
      expect(r.periodo).toEqual({ tipo: 'mandato', label: '2025–2028' });
    });

    it('exercício explícito tem precedência sobre mandato', () => {
      const r = listarCredoresDoPeriodo({ exercicio: 2024, mandato: 2026 });

      expect(r.periodo).toEqual({ tipo: 'exercicio', label: '2024' });
    });

    it('fronteira: mandato 2024 e 2025 resolvem para exercícios diferentes', () => {
      listarCredoresDoPeriodo({ mandato: 2024 });
      listarCredoresDoPeriodo({ mandato: 2025 });

      expect(listCredores).toHaveBeenNthCalledWith(1, expect.objectContaining({ exercicios: [2021, 2022, 2023, 2024] }));
      expect(listCredores).toHaveBeenNthCalledWith(2, expect.objectContaining({ exercicios: [2025, 2026, 2027, 2028] }));
    });

    it('exercicio invalido com mandato valido usa o mandato (mesma regra de resolverExercicios)', () => {
      const r = listarCredoresDoPeriodo({ exercicio: -5, mandato: 2026 });

      expect(r.periodo).toEqual({ tipo: 'mandato', label: '2025–2028' });
    });

    it('mandato inválido cai no acumulado em vez de inventar período', () => {
      const r = listarCredoresDoPeriodo({ mandato: Number.NaN });

      expect(r.periodo.tipo).toBe('acumulado');
    });

    it('sem filtro usa a cobertura dos dados e diz que é acumulado', () => {
      const r = listarCredoresDoPeriodo({});

      expect(r.periodo).toEqual({ tipo: 'acumulado', label: '2019–2026' });
    });
  });
});
