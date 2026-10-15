'use strict';

const { montarDestaqueCredor, rotuloPeriodoLista } = require('./credor-destaque');
const { agruparPorMandato } = require('../utils/mandato');

function mandatos(porAno, anoAtual) {
  return agruparPorMandato(porAno, {
    camposSoma: ['n_empenhos', 'valor_total'],
    anoAtual,
  });
}

describe('credor-destaque', () => {
  describe('montarDestaqueCredor', () => {
    it('destaca o mandato em curso e deixa o acumulado como secundário', () => {
      // Arrange: R$ 1.000 em 2000 e R$ 1.000 em 2025 (exemplo-guia do fiscal-valores)
      const porAno = [
        { ano: 2000, n_empenhos: 1, valor_total: 1000 },
        { ano: 2025, n_empenhos: 2, valor_total: 1000 },
      ];

      // Act
      const r = montarDestaqueCredor({ porAno, porMandato: mandatos(porAno, 2026), anoAtual: 2026 });

      // Assert
      expect(r.destaque).toMatchObject({
        mandato: '2025-2028',
        valor_total: 1000,
        n_empenhos: 2,
        em_curso: true,
      });
      expect(r.acumulado).toMatchObject({ valor_total: 2000, n_empenhos: 3 });
      expect(r.acumulado.label).toBe('2000–2025');
    });

    it('mantém zero explícito quando o credor não tem dados no mandato em curso', () => {
      const porAno = [{ ano: 2022, n_empenhos: 4, valor_total: 500 }];

      const r = montarDestaqueCredor({ porAno, porMandato: mandatos(porAno, 2026), anoAtual: 2026 });

      expect(r.destaque).toMatchObject({ mandato: '2025-2028', valor_total: 0, n_empenhos: 0, em_curso: true });
      expect(r.acumulado.valor_total).toBe(500);
    });

    it('invariante: acumulado == soma de todos os mandatos', () => {
      const porAno = [
        { ano: 2019, n_empenhos: 1, valor_total: 10 },
        { ano: 2022, n_empenhos: 1, valor_total: 20 },
        { ano: 2026, n_empenhos: 1, valor_total: 30 },
      ];
      const porMandato = mandatos(porAno, 2026);

      const r = montarDestaqueCredor({ porAno, porMandato, anoAtual: 2026 });

      const soma = porMandato.reduce((acc, m) => acc + m.valor_total, 0);
      expect(r.acumulado.valor_total).toBe(soma);
    });

    it('sem dados algum: destaque zerado e acumulado nulo', () => {
      const r = montarDestaqueCredor({ porAno: [], porMandato: [], anoAtual: 2026 });

      expect(r.destaque.valor_total).toBe(0);
      expect(r.acumulado).toBeNull();
    });

    it('fronteira 2024-12/2025-01: ano 2024 pertence ao mandato anterior', () => {
      const porAno = [
        { ano: 2024, n_empenhos: 1, valor_total: 700 },
        { ano: 2025, n_empenhos: 1, valor_total: 300 },
      ];

      const r = montarDestaqueCredor({ porAno, porMandato: mandatos(porAno, 2025), anoAtual: 2025 });

      expect(r.destaque.valor_total).toBe(300);
    });
  });

  describe('rotuloPeriodoLista', () => {
    it('ano único', () => {
      expect(rotuloPeriodoLista({ exercicio: 2024 })).toBe('2024');
    });

    it('lista de exercícios vira intervalo', () => {
      expect(rotuloPeriodoLista({ exercicios: [2025, 2026, 2027, 2028] })).toBe('2025–2028');
    });

    it('sem filtro usa o intervalo coberto pelos dados', () => {
      expect(rotuloPeriodoLista({ cobertura: { primeiro: 2019, ultimo: 2026 } })).toBe('2019–2026');
    });

    it('sem nada, devolve null (a UI não inventa período)', () => {
      expect(rotuloPeriodoLista({})).toBeNull();
    });
  });
});
