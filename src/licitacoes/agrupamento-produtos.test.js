'use strict';

const {
  cosineSimilarity,
  agruparPorSimilaridade,
  escolherRotuloCanonico,
} = require('./agrupamento-produtos');

describe('licitacoes/agrupamento-produtos · cosineSimilarity', () => {
  it('vetores idênticos → 1', () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
  });
  it('vetores ortogonais → 0', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });
  it('mesma direção, magnitudes diferentes → 1', () => {
    expect(cosineSimilarity([2, 0], [5, 0])).toBeCloseTo(1);
  });
  it('vetor nulo → 0 (sem divisão por zero)', () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe('licitacoes/agrupamento-produtos · agruparPorSimilaridade', () => {
  // 3 itens "gasolina-like" próximos + 1 distinto
  const itens = [
    { chave: 'gasolina', vetor: [1, 0, 0], peso: 5 },
    { chave: 'gasolina comum', vetor: [0.99, 0.1, 0], peso: 10 },
    { chave: 'gasolina comum tipo c', vetor: [0.98, 0.15, 0], peso: 2 },
    { chave: 'cimento cp2', vetor: [0, 0, 1], peso: 8 },
  ];

  it('agrupa itens acima do limiar e separa o distinto', () => {
    const grupos = agruparPorSimilaridade(itens, { limiar: 0.9 });
    expect(grupos).toHaveLength(2);
    const gGasolina = grupos.find((g) => g.membros.includes('gasolina'));
    expect(gGasolina.membros.sort()).toEqual(
      ['gasolina', 'gasolina comum', 'gasolina comum tipo c'].sort()
    );
    const gCimento = grupos.find((g) => g.membros.includes('cimento cp2'));
    expect(gCimento.membros).toEqual(['cimento cp2']);
  });

  it('limiar alto demais deixa cada item sozinho', () => {
    const grupos = agruparPorSimilaridade(itens, { limiar: 0.999 });
    expect(grupos).toHaveLength(4);
  });

  it('escolhe representante pelo maior peso', () => {
    const grupos = agruparPorSimilaridade(itens, { limiar: 0.9 });
    const gGasolina = grupos.find((g) => g.membros.includes('gasolina'));
    expect(gGasolina.representante).toBe('gasolina comum'); // peso 10
  });

  it('lista vazia → sem grupos', () => {
    expect(agruparPorSimilaridade([], { limiar: 0.9 })).toEqual([]);
  });
});

describe('licitacoes/agrupamento-produtos · assinaturaNumerica / numerosCompativeis', () => {
  const { assinaturaNumerica, numerosCompativeis } = require('./agrupamento-produtos');

  it('extrai números relevantes (ignora pontuação)', () => {
    expect(assinaturaNumerica('pneu 205 70 r15')).toEqual(['205', '70', '15']);
    expect(assinaturaNumerica('gasolina comum')).toEqual([]);
  });

  it('compatível quando ambos não têm números (variantes de texto)', () => {
    expect(numerosCompativeis('gasolina', 'gasolina comum')).toBe(true);
  });

  it('compatível quando os números são os mesmos ("120 g" vs "120 grs")', () => {
    expect(numerosCompativeis('biscoito 120 g', 'biscoito 120 grs')).toBe(true);
  });

  it('incompatível quando os números diferem (tamanhos de pneu)', () => {
    expect(numerosCompativeis('pneu 205 70 r15', 'pneu 185 60 r15')).toBe(false);
  });

  it('compatível quando um lado não tem número (genérico vs específico)', () => {
    expect(numerosCompativeis('oleo diesel', 'oleo diesel s10')).toBe(true);
  });
});

describe('licitacoes/agrupamento-produtos · agruparPorSimilaridade com guarda numérica', () => {
  it('NÃO mescla itens semanticamente próximos mas com números diferentes', () => {
    const itens = [
      { chave: 'pneu 205 70 r15', vetor: [1, 0], peso: 5 },
      { chave: 'pneu 185 60 r15', vetor: [0.999, 0.01], peso: 3 },
    ];
    const grupos = agruparPorSimilaridade(itens, { limiar: 0.9, guardaNumerica: true });
    expect(grupos).toHaveLength(2);
  });

  it('mescla variantes de texto puro mesmo com guarda numérica', () => {
    const itens = [
      { chave: 'gasolina', vetor: [1, 0], peso: 5 },
      { chave: 'gasolina comum', vetor: [0.999, 0.01], peso: 3 },
    ];
    const grupos = agruparPorSimilaridade(itens, { limiar: 0.9, guardaNumerica: true });
    expect(grupos).toHaveLength(1);
  });
});

describe('licitacoes/agrupamento-produtos · escolherRotuloCanonico', () => {
  it('prefere o de maior peso; desempate pelo mais curto', () => {
    expect(
      escolherRotuloCanonico([
        { chave: 'gasolina comum tipo c aditivada', peso: 1 },
        { chave: 'gasolina comum', peso: 10 },
        { chave: 'gasolina', peso: 10 },
      ])
    ).toBe('gasolina');
  });
});
