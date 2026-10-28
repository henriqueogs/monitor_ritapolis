'use strict';

const { rotuloIntervaloAnos, intervaloDasLinhas } = require('../frontend/lib/intervalo-anos');

describe('intervalo-anos', () => {
  describe('rotuloIntervaloAnos', () => {
    it('mostra o intervalo min–max, ou um ano só quando coincidem', () => {
      expect(rotuloIntervaloAnos(2023, 2026)).toBe('2023–2026');
      expect(rotuloIntervaloAnos(2025, 2025)).toBe('2025');
    });

    it('sem ano conhecido não inventa período', () => {
      expect(rotuloIntervaloAnos(null, null)).toBe('');
    });
  });

  describe('intervaloDasLinhas', () => {
    it('junta o menor e o maior ano das linhas que têm valor (§11.1: soma multi-ano leva o intervalo)', () => {
      const linhas = [
        { ano_min_valor_final: 2024, ano_max_valor_final: 2025 },
        { ano_min_valor_final: null, ano_max_valor_final: null },
        { ano_min_valor_final: 2022, ano_max_valor_final: 2023 },
      ];

      expect(intervaloDasLinhas(linhas, 'valor_final')).toEqual({ min: 2022, max: 2025 });
    });

    it('lista vazia ou sem anos dá null nos dois lados', () => {
      expect(intervaloDasLinhas([], 'valor_final')).toEqual({ min: null, max: null });
    });
  });
});
