'use strict';

const { anosReferenciaYoY, janelaAnos, limiarDispensa, parseExercicio } = require('./periodo-inteligencia');

describe('periodo-inteligencia', () => {
  describe('anosReferenciaYoY', () => {
    it('ano em curso nunca é referência: compara o último ano fechado com o anterior', () => {
      expect(anosReferenciaYoY({ anosMax: 2026, anoAtual: 2026 })).toEqual({
        ano_ref: 2025,
        ano_anterior: 2024,
        ano_parcial: 2026,
      });
    });

    it('acompanha a virada de ano sem mexer no código (2027)', () => {
      expect(anosReferenciaYoY({ anosMax: 2027, anoAtual: 2027 })).toMatchObject({
        ano_ref: 2026,
        ano_anterior: 2025,
      });
    });

    it('janela já fechada usa o próprio último ano e não tem ano parcial', () => {
      expect(anosReferenciaYoY({ anosMax: 2025, anoAtual: 2026 })).toMatchObject({
        ano_ref: 2025,
        ano_anterior: 2024,
        ano_parcial: null,
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

    it('fronteira real de hoje: 2025 e o primeiro ano extrapolado', () => {
      expect(limiarDispensa(2024).extrapolado).toBe(false);
      expect(limiarDispensa(2025).extrapolado).toBe(true);
    });

    it('ano invalido (NaN, negativo) nao lanca: usa o regime mais recente e marca extrapolado', () => {
      for (const ano of [Number.NaN, -5, undefined, 'abc']) {
        const r = limiarDispensa(ano);
        expect(r.valor).toBe(57900);
        expect(r.extrapolado).toBe(true);
      }
    });

    it('ano sem valor conferido usa o último conhecido e avisa que é extrapolado', () => {
      const r = limiarDispensa(2027);

      expect(r.valor).toBe(57900);
      expect(r.extrapolado).toBe(true);
      expect(r.fonte).toEqual(expect.any(String));
    });
  });
});

describe('parseExercicio (valida o ?exercicio= antes de chegar ao dominio)', () => {
  it('ausente ou vazio e valido e devolve undefined (usa o padrao dos dados)', () => {
    expect(parseExercicio(undefined)).toEqual({ valido: true, valor: undefined });
    expect(parseExercicio('')).toEqual({ valido: true, valor: undefined });
  });

  it('aceita ano inteiro plausivel', () => {
    expect(parseExercicio('2025')).toEqual({ valido: true, valor: 2025 });
  });

  it.each(['abc', '-1', '20.5', '1800', '3000'])('rejeita "%s"', (raw) => {
    expect(parseExercicio(raw).valido).toBe(false);
  });
});
