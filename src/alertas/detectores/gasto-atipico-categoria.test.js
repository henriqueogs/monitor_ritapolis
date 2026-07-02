'use strict';

const { detectarGastoAtipicoCategoria } = require('./gasto-atipico-categoria');

const OPCOES = {
  shareMinimo: 0.4,
  multiplicadorSalto: 3,
  valorMinimo: 10000,
  minCredoresCategoria: 4,
};

function credor(slug, ano, cnpj, valor, extras = {}) {
  return {
    slug,
    rotulo: 'Diárias',
    ano,
    credor_cnpj: cnpj,
    credor_nome: `CREDOR ${cnpj}`,
    n: 3,
    valor_total: valor,
    empenho_ids: [Number(cnpj) * 10],
    ...extras,
  };
}

describe('detectarGastoAtipicoCategoria', () => {
  describe('concentração: credor domina a categoria no ano', () => {
    it('emite sinal quando um credor tem ≥ share mínimo do total da categoria', () => {
      const agregados = [
        credor('diarias', 2026, '1', 2000),
        credor('diarias', 2026, '2', 3000),
        credor('diarias', 2026, '3', 4000),
        credor('diarias', 2026, '4', 5000),
        credor('diarias', 2026, '5', 30000), // 30000/44000 = 68% ≥ 40%; ≥ piso
      ];
      const sinais = detectarGastoAtipicoCategoria(agregados, OPCOES);
      const s = sinais.find((x) => x.tipo === 'gasto_atipico_credor');
      expect(s).toBeDefined();
      expect(s.credor_cnpj).toBe('5');
      expect(s.ano).toBe(2026);
      expect(s.categoria_slug).toBe('diarias');
      expect(s.valor).toBe(30000);
      expect(s.share).toBeCloseTo(30000 / 44000, 3);
      expect(s.empenho_ids).toEqual([50]);
      expect(s.motivo).toContain('2026');
      expect(s.motivo).toContain('%');
    });

    it('não emite quando ninguém domina (cauda longa normal)', () => {
      const agregados = [
        credor('diarias', 2026, '1', 10000),
        credor('diarias', 2026, '2', 11000),
        credor('diarias', 2026, '3', 12000),
        credor('diarias', 2026, '4', 13000),
        credor('diarias', 2026, '5', 15000), // 15000/61000 = 25% < 40%
      ];
      expect(
        detectarGastoAtipicoCategoria(agregados, OPCOES).filter((s) => s.tipo === 'gasto_atipico_credor')
      ).toHaveLength(0);
    });

    it('não emite abaixo do piso absoluto', () => {
      const agregados = [
        credor('diarias', 2026, '1', 100),
        credor('diarias', 2026, '2', 200),
        credor('diarias', 2026, '3', 300),
        credor('diarias', 2026, '4', 400),
        credor('diarias', 2026, '5', 5000), // 83% share mas < piso 10000
      ];
      expect(
        detectarGastoAtipicoCategoria(agregados, OPCOES).filter((s) => s.tipo === 'gasto_atipico_credor')
      ).toHaveLength(0);
    });

    it('não emite com poucos credores na categoria (dominar entre 2 é banal)', () => {
      const agregados = [
        credor('diarias', 2026, '1', 1000),
        credor('diarias', 2026, '2', 50000),
      ];
      expect(
        detectarGastoAtipicoCategoria(agregados, OPCOES).filter((s) => s.tipo === 'gasto_atipico_credor')
      ).toHaveLength(0);
    });
  });

  describe('salto anual da categoria', () => {
    it('emite quando o total do ano ≥ M× o do ano anterior', () => {
      const agregados = [
        credor('eventos', 2025, '1', 20000, { rotulo: 'Serviços de empresas' }),
        credor('eventos', 2026, '1', 45000, { rotulo: 'Serviços de empresas' }),
        credor('eventos', 2026, '2', 40000, { rotulo: 'Serviços de empresas' }),
      ];
      const sinais = detectarGastoAtipicoCategoria(agregados, OPCOES);
      const s = sinais.find((x) => x.tipo === 'gasto_atipico_salto');
      expect(s).toBeDefined();
      expect(s.ano).toBe(2026);
      expect(s.valor).toBe(85000);
      expect(s.valor_anterior).toBe(20000);
      expect(s.empenho_ids.sort()).toEqual([10, 20]);
    });

    it('não emite sem ano anterior', () => {
      const agregados = [credor('obras', 2026, '1', 90000)];
      expect(
        detectarGastoAtipicoCategoria(agregados, OPCOES).filter((s) => s.tipo === 'gasto_atipico_salto')
      ).toHaveLength(0);
    });

    it('não emite abaixo do piso mesmo com salto grande', () => {
      const agregados = [
        credor('obras', 2025, '1', 100),
        credor('obras', 2026, '1', 5000), // 50× mas < piso
      ];
      expect(
        detectarGastoAtipicoCategoria(agregados, OPCOES).filter((s) => s.tipo === 'gasto_atipico_salto')
      ).toHaveLength(0);
    });
  });

  it('entrada vazia retorna lista vazia', () => {
    expect(detectarGastoAtipicoCategoria([], OPCOES)).toEqual([]);
    expect(detectarGastoAtipicoCategoria(null, OPCOES)).toEqual([]);
  });

  it('ignora categorias de fluxo interno (extra-orçamentário, encargos, pessoal)', () => {
    const agregados = [
      credor('extra-orcamentario', 2025, '1', 20000),
      credor('extra-orcamentario', 2026, '1', 90000),
    ];
    expect(detectarGastoAtipicoCategoria(agregados, OPCOES)).toHaveLength(0);
  });
});
