'use strict';

const { recallAtK, reciprocalRank, media, citacoesValidas, recusaCorreta } = require('./metricas');

describe('recallAtK', () => {
  it('fração das fontes esperadas presentes no top-k', () => {
    expect(recallAtK(['A', 'B'], ['X', 'A', 'Y', 'B'], 2)).toBe(0.5);
    expect(recallAtK(['A', 'B'], ['X', 'A', 'Y', 'B'], 4)).toBe(1);
    expect(recallAtK(['A'], ['X', 'Y'], 5)).toBe(0);
  });

  it('sem fontes esperadas não há recall definido (null), nunca 1 por default', () => {
    expect(recallAtK([], ['A'], 5)).toBeNull();
  });
});

describe('reciprocalRank', () => {
  it('inverso da posição do primeiro acerto', () => {
    expect(reciprocalRank(['B'], ['A', 'B', 'C'])).toBe(0.5);
    expect(reciprocalRank(['A', 'C'], ['X', 'C', 'A'])).toBe(0.5);
  });

  it('zero quando nenhuma fonte esperada aparece', () => {
    expect(reciprocalRank(['Z'], ['A', 'B'])).toBe(0);
  });
});

describe('media', () => {
  it('ignora nulos e devolve null para lista sem valores', () => {
    expect(media([1, null, 0.5])).toBe(0.75);
    expect(media([null])).toBeNull();
    expect(media([])).toBeNull();
  });
});

describe('citacoesValidas', () => {
  const contexto = [
    { docId: 1, texto: 'A empresa Alimentos Minas foi declarada vencedora do pregão.', url_origem: 'https://x/1' },
    { docId: 2, texto: 'Decreto sobre horário de funcionamento.', url_origem: 'https://x/2' },
  ];

  it('aceita citação cujo documento está no contexto e cujo trecho existe no texto (sem acento/caixa)', () => {
    const r = citacoesValidas({
      citacoes: [{ doc_id: 1, trecho: 'ALIMENTOS MINAS foi declarada vencedora', url_origem: 'https://x/1' }],
      contexto,
    });

    expect(r).toEqual({ validas: 1, total: 1, invalidas: [] });
  });

  it('rejeita documento fora do contexto, trecho inventado e citação sem url_origem (§11.3)', () => {
    const r = citacoesValidas({
      citacoes: [
        { doc_id: 99, trecho: 'qualquer', url_origem: 'https://x/99' },
        { doc_id: 1, trecho: 'a empresa ganhou 1 milhão', url_origem: 'https://x/1' },
        { doc_id: 2, trecho: 'Decreto sobre horário', url_origem: '' },
      ],
      contexto,
    });

    expect(r.validas).toBe(0);
    expect(r.invalidas.map((i) => i.motivo)).toEqual(['doc_fora_do_contexto', 'trecho_nao_encontrado', 'sem_url_origem']);
  });

  it('resposta sem nenhuma citação conta como zero válidas de zero', () => {
    expect(citacoesValidas({ citacoes: [], contexto })).toEqual({ validas: 0, total: 0, invalidas: [] });
  });
});

describe('recusaCorreta', () => {
  it('recusa quando deveria recusar e responde quando deveria responder', () => {
    expect(recusaCorreta({ recusou: true }, true)).toBe(true);
    expect(recusaCorreta({ recusou: false }, false)).toBe(true);
    expect(recusaCorreta({ recusou: false }, true)).toBe(false);
    expect(recusaCorreta({ recusou: true }, false)).toBe(false);
  });
});
