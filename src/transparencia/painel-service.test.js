'use strict';

jest.mock('../db/transparencia-repo', () => ({
  getPainelResumo: jest.fn(),
  getDespesas: jest.fn(),
  getDespesasPorDocumento: jest.fn(),
}));

const repo = require('../db/transparencia-repo');
const {
  getPainelTransparencia,
  getDespesasComPortal,
  getDespesasDocumentoComPortal,
} = require('./painel-service');

const painelBase = {
  total: { n_empenhos: 4, valor_total: 150 },
  porAno: [
    { exercicio: 2026, n_empenhos: 2, valor_total: 120, valor_estimado_global: 9, valor_empenhado: 129, n_empenhos_vinculados: 1, valor_receita_previsto: 500 },
    { exercicio: 2025, n_empenhos: 1, valor_total: 20, valor_estimado_global: 0, valor_empenhado: 20, n_empenhos_vinculados: 0, valor_receita_previsto: 400 },
    { exercicio: 2023, n_empenhos: 1, valor_total: 10, valor_estimado_global: 0, valor_empenhado: 10, n_empenhos_vinculados: 0, valor_receita_previsto: 300 },
  ],
  topCredores: [],
  ultimosEmpenhos: [
    { empenho: '02119-000', exercicio_orcamento: 2026, tipo: 'EO - Empenho Ordinário', valor: 80 },
    { empenho: null, exercicio_orcamento: 2026, tipo: 'EO', valor: 40 },
  ],
  logs: [],
  tiposEmpenho: [],
  receitasPorAno: [],
};

describe('painel-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    repo.getPainelResumo.mockReturnValue(painelBase);
  });

  describe('getPainelTransparencia', () => {
    it('agrega porMandato a partir de porAno', () => {
      const painel = getPainelTransparencia();

      expect(painel.porMandato).toHaveLength(2);
      const [atual, anterior] = painel.porMandato;
      expect(atual.mandato).toBe('2025-2028');
      expect(atual.n_empenhos).toBe(3);
      expect(atual.valor_total).toBe(140);
      expect(atual.valor_estimado_global).toBe(9); // somado à parte, nunca dentro de valor_total
      expect(atual.anos).toEqual([2025, 2026]);
      expect(anterior.mandato).toBe('2021-2024');
      expect(anterior.anos).toEqual([2023]);
    });

    it('invariante: valor_empenhado do mandato == soma dos anos (subtotal fecha com as linhas)', () => {
      const painel = getPainelTransparencia();

      const [atual] = painel.porMandato;
      const somaAnos = painelBase.porAno
        .filter((r) => atual.anos.includes(r.exercicio))
        .reduce((acc, r) => acc + r.valor_empenhado, 0);
      expect(atual.valor_empenhado).toBe(somaAnos);
    });

    it('fronteira 2024/2025: ordinario e estimativo/global ficam em mandatos distintos', () => {
      repo.getPainelResumo.mockReturnValue({
        ...painelBase,
        porAno: [
          { exercicio: 2025, n_empenhos: 1, valor_total: 300, valor_estimado_global: 30, valor_empenhado: 330 },
          { exercicio: 2024, n_empenhos: 1, valor_total: 700, valor_estimado_global: 70, valor_empenhado: 770 },
        ],
      });

      const painel = getPainelTransparencia({ exercicio: 2025 });

      const [atual, anterior] = painel.porMandato;
      expect(atual).toMatchObject({ mandato: '2025-2028', valor_total: 300, valor_estimado_global: 30, valor_empenhado: 330 });
      expect(anterior).toMatchObject({ mandato: '2021-2024', valor_total: 700, valor_estimado_global: 70, valor_empenhado: 770 });
    });

    it('monta periodo com exercicio e mandato quando filtrado', () => {
      repo.getPainelResumo.mockReturnValue(painelBase);
      const painel = getPainelTransparencia({ exercicio: 2026 });

      expect(repo.getPainelResumo).toHaveBeenCalledWith({ exercicio: 2026 });
      expect(painel.periodo.exercicio).toBe(2026);
      expect(painel.periodo.mandato).toEqual({ inicio: 2025, fim: 2028, label: '2025-2028' });
      expect(painel.periodo.anos_cobertos).toEqual([2023, 2026]);
    });

    it('modo mandato: escopa pelos anos do mandato e monta periodo', () => {
      const painel = getPainelTransparencia({ mandato: 2025 });

      expect(repo.getPainelResumo).toHaveBeenCalledWith({
        exercicios: [2025, 2026, 2027, 2028],
      });
      expect(painel.periodo.exercicio).toBeNull();
      expect(painel.periodo.mandato).toEqual({ inicio: 2025, fim: 2028, label: '2025-2028' });
    });

    it('monta periodo sem exercicio (visão completa)', () => {
      const painel = getPainelTransparencia();
      expect(painel.periodo.exercicio).toBeNull();
      expect(painel.periodo.mandato).toBeNull();
      expect(painel.periodo.anos_cobertos).toEqual([2023, 2026]);
    });

    it('adiciona portal aos ultimosEmpenhos', () => {
      const painel = getPainelTransparencia();
      expect(painel.ultimosEmpenhos[0].portal.especifico).toBe(true);
      expect(painel.ultimosEmpenhos[0].portal.url).toContain('ID8_DESP=02119000');
      expect(painel.ultimosEmpenhos[1].portal.especifico).toBe(false);
    });
  });

  describe('getDespesasComPortal', () => {
    it('repassa filtros e adiciona portal aos dados', () => {
      repo.getDespesas.mockReturnValue({
        total: 1,
        pagina: 1,
        limite: 25,
        dados: [{ empenho: '00001-000', exercicio_orcamento: 2024, tipo: 'OP - Ordem de Pagamento' }],
      });

      const out = getDespesasComPortal({ credor_cnpj: '01991246000135', pagina: 1, limite: 25 });

      expect(repo.getDespesas).toHaveBeenCalledWith({
        credor_cnpj: '01991246000135',
        pagina: 1,
        limite: 25,
      });
      expect(out.total).toBe(1);
      expect(out.dados[0].portal.url).toContain('LG_OP_DESP=S');
    });
  });

  describe('getDespesasDocumentoComPortal', () => {
    it('adiciona portal aos empenhos do documento', () => {
      repo.getDespesasPorDocumento.mockReturnValue([
        { empenho: '02119-000', exercicio_orcamento: 2026, tipo: 'EO' },
      ]);
      const out = getDespesasDocumentoComPortal(42);
      expect(repo.getDespesasPorDocumento).toHaveBeenCalledWith(42);
      expect(out[0].portal.especifico).toBe(true);
    });
  });
});
