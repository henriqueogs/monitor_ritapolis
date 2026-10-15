'use strict';

const { anosReferenciaYoY, janelaAnos, limiarDispensa } = require('./periodo-inteligencia');

describe('periodo-inteligencia', () => {
  describe('anosReferenciaYoY', () => {
    it('ano em curso nunca é referência: compara o último ano fechado com o anterior', () => {
      expect(anosReferenciaYoY({ anosMax: 2026, anoAtual: 2026 })).toEqual({
        ano_ref: 2025,
        ano_anterior: 2024,
        ano_ref_completo: true,
      });
    });

    it('acompanha a virada de ano sem mexer no código (2027)', () => {
      expect(anosReferenciaYoY({ anosMax: 2027, anoAtual: 2027 })).toMatchObject({
        ano_ref: 2026,
        ano_anterior: 2025,
      });
    });

    it('janela já fechada usa o próprio último ano', () => {
      expect(anosReferenciaYoY({ anosMax: 2025, anoAtual: 2026 })).toMatchObject({
        ano_ref: 2025,
        ano_anterior: 2024,
      });
    });

    it('invariante: ano anterior é sempre ano_ref - 1', () => {
      for (const anosMax of [2023, 2024, 2025, 2026, 2030]) {
        const r = anosReferenciaYoY({ anosMax, anoAtual: 2026 });
        expect(r.ano_anterior).toBe(r.ano_ref - 1);
      }
    });
  });

  describe('janelaAnos', () => {
    it('deriva o máximo dos dados e respeita o piso configurado', () => {
      expect(janelaAnos({ anosDisponiveis: [2022, 2023, 2024, 2025, 2026], anoMin: 2023 })).toEqual({
        anosMin: 2023,
        anosMax: 2026,
      });
    });

    it('não inventa anos antes do primeiro com dados', () => {
      expect(janelaAnos({ anosDisponiveis: [2025, 2026], anoMin: 2023 })).toEqual({
        anosMin: 2025,
        anosMax: 2026,
      });
    });

    it('sem anos com dados devolve null (e não 2025)', () => {
      expect(janelaAnos({ anosDisponiveis: [], anoMin: 2023 })).toBeNull();
    });
  });

  describe('limiarDispensa', () => {
    it('regime anterior até 2023', () => {
      expect(limiarDispensa(2023)).toMatchObject({ valor: 17600, extrapolado: false });
    });

    it('regime atual a partir de 2024', () => {
      expect(limiarDispensa(2024)).toMatchObject({ valor: 57900, extrapolado: false });
    });

    it('ano sem valor conferido usa o último conhecido e avisa que é extrapolado', () => {
      const r = limiarDispensa(2027);

      expect(r.valor).toBe(57900);
      expect(r.extrapolado).toBe(true);
      expect(r.fonte).toEqual(expect.any(String));
    });
  });
});
