'use strict';

jest.mock('../db/transparencia-agregados-repo', () => ({
  getAgregadoPorCategoriaEconomica: jest.fn(),
  getAgregadoPorUnidade: jest.fn(),
  getAgregadoPorFonteRecurso: jest.fn(),
  getRankingCredores: jest.fn(),
  getCategoriaPorAno: jest.fn(),
}));

const repo = require('../db/transparencia-agregados-repo');
const { getGastosPanorama, getCategoriaDossie } = require('./gastos-service');

describe('gastos-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    repo.getAgregadoPorCategoriaEconomica.mockReturnValue([
      { categoria_economica: '3.3.90.14.00 - DIÁRIAS - CIVIL', n: 2, valor_total: 30 },
      { categoria_economica: '3.3.90.14.00 - DIÁRIAS - MILITAR', n: 1, valor_total: 5 },
      { categoria_economica: '4.4.90.51.00 - OBRAS', n: 1, valor_total: 300 },
    ]);
    repo.getAgregadoPorUnidade.mockReturnValue([{ unidade: '02.001 - ADM', n: 4, valor_total: 335 }]);
    repo.getAgregadoPorFonteRecurso.mockReturnValue([
      { fonte_recurso: '1.500.000 - PRÓPRIOS', n: 3, valor_total: 300 },
    ]);
    repo.getRankingCredores.mockReturnValue([
      { credor_nome: 'B', credor_cnpj: '2', n: 1, valor_total: 20 },
    ]);
    repo.getCategoriaPorAno.mockReturnValue([
      { exercicio: 2025, n: 1, valor_total: 40 },
      { exercicio: 2026, n: 3, valor_total: 335 },
    ]);
  });

  describe('getGastosPanorama', () => {
    it('reclassifica e re-agrega categorias por slug cidadão', () => {
      const panorama = getGastosPanorama({ exercicio: 2026 });

      expect(repo.getAgregadoPorCategoriaEconomica).toHaveBeenCalledWith({ exercicios: [2026] });
      const diarias = panorama.categorias.find((c) => c.slug === 'diarias');
      expect(diarias).toMatchObject({ rotulo: 'Diárias', n_empenhos: 3, valor_total: 35 });
      const obras = panorama.categorias.find((c) => c.slug === 'obras');
      expect(obras.valor_total).toBe(300);
      // ordenado por valor desc
      expect(panorama.categorias[0].slug).toBe('obras');
    });

    it('modo mandato resolve os 4 exercícios', () => {
      getGastosPanorama({ mandato: 2026 });
      expect(repo.getAgregadoPorCategoriaEconomica).toHaveBeenCalledWith({
        exercicios: [2025, 2026, 2027, 2028],
      });
    });

    it('sem filtro agrega tudo e monta periodo/por_mandato', () => {
      const panorama = getGastosPanorama();
      expect(repo.getAgregadoPorCategoriaEconomica).toHaveBeenCalledWith({ exercicios: undefined });
      expect(panorama.periodo.exercicio).toBeNull();
      expect(panorama.periodo.anos_cobertos).toEqual([2025, 2026]);
      expect(panorama.por_mandato[0].mandato).toBe('2025-2028');
      expect(panorama.por_unidade).toHaveLength(1);
      expect(panorama.por_fonte).toHaveLength(1);
    });
  });

  describe('getCategoriaDossie', () => {
    it('retorna null para slug desconhecido', () => {
      expect(getCategoriaDossie('nao-existe', {})).toBeNull();
    });

    it('compõe dossiê da categoria com prefixos corretos', () => {
      const dossie = getCategoriaDossie('diarias', { exercicio: 2026 });

      expect(repo.getRankingCredores).toHaveBeenCalledWith({
        prefixos: ['3.3.90.14'],
        exercicios: [2026],
        limite: 15,
      });
      expect(repo.getCategoriaPorAno).toHaveBeenCalledWith({ prefixos: ['3.3.90.14'] });
      expect(dossie.categoria).toEqual({ slug: 'diarias', rotulo: 'Diárias', grupo: 'custeio' });
      expect(dossie.periodo.exercicio).toBe(2026);
      expect(dossie.por_ano).toHaveLength(2);
      expect(dossie.por_mandato[0].valor_total).toBe(375); // 2025 (40) + 2026 (335)
      expect(dossie.top_credores).toHaveLength(1);
    });
  });
});
