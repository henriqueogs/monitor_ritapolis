'use strict';

const {
  recallAtK,
  reciprocalRank,
  media,
  citacoesValidas,
  recusaCorreta,
  avaliarFundamentacao,
} = require('./metricas');

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
    {
      docId: 1,
      texto: 'A empresa Alimentos Minas foi declarada vencedora do pregão.',
      url_origem: 'https://x/1',
    },
    {
      docId: 1,
      texto: 'O valor homologado foi de dez mil reais para o item único.',
      url_origem: 'https://x/1',
    },
    { docId: 2, texto: 'Decreto sobre horário de funcionamento.', url_origem: 'https://x/2' },
  ];
  const citacao = extra => ({
    doc_id: 1,
    trecho: 'declarada vencedora do pregão',
    url_origem: 'https://x/1',
    ...extra,
  });

  it('aceita citação cujo documento está no contexto, trecho presente (sem acento/caixa) e url igual à do contexto', () => {
    const r = citacoesValidas({
      citacoes: [citacao({ trecho: 'ALIMENTOS MINAS foi declarada vencedora' })],
      contexto,
    });

    expect(r).toEqual({ validas: 1, total: 1, invalidas: [] });
  });

  it('o trecho pode vir de QUALQUER chunk do mesmo documento', () => {
    const r = citacoesValidas({
      citacoes: [citacao({ trecho: 'valor homologado foi de dez mil reais' })],
      contexto,
    });

    expect(r.validas).toBe(1);
  });

  it('doc_id como texto casa com o docId numérico', () => {
    expect(citacoesValidas({ citacoes: [citacao({ doc_id: '1' })], contexto }).validas).toBe(1);
  });

  it('rejeita documento fora do contexto, trecho inventado, trecho vazio/curto demais e url inventada ou ausente', () => {
    const r = citacoesValidas({
      citacoes: [
        citacao({ doc_id: 99 }),
        citacao({ trecho: 'a empresa ganhou 1 milhão de reais' }),
        citacao({ trecho: '' }),
        citacao({ trecho: 'de' }),
        citacao({ url_origem: 'https://inventada.example/x' }),
        citacao({ url_origem: '' }),
      ],
      contexto,
    });

    expect(r.validas).toBe(0);
    expect(r.invalidas.map(i => i.motivo)).toEqual([
      'doc_fora_do_contexto',
      'trecho_nao_encontrado',
      'trecho_curto_demais',
      'trecho_curto_demais',
      'url_diferente_do_contexto',
      'sem_url_origem',
    ]);
  });

  it('resposta sem citações (ou citacoes indefinido) dá zero de zero, sem lançar', () => {
    expect(citacoesValidas({ citacoes: [], contexto })).toEqual({
      validas: 0,
      total: 0,
      invalidas: [],
    });
    expect(citacoesValidas({ contexto })).toEqual({ validas: 0, total: 0, invalidas: [] });
  });
});

describe('avaliarFundamentacao (ADR 0005: citar ou recusar)', () => {
  const contexto = [
    {
      docId: 1,
      texto: 'A empresa Alimentos Minas foi vencedora do pregão.',
      url_origem: 'https://x/1',
    },
  ];
  const boa = { doc_id: 1, trecho: 'Alimentos Minas foi vencedora', url_origem: 'https://x/1' };

  it('recusa explícita é fundamentada (não precisa citar)', () => {
    expect(
      avaliarFundamentacao({ resposta: { recusou: true, citacoes: [] }, contexto })
    ).toMatchObject({ ok: true });
  });

  it('resposta que não recusa e não cita nada FALHA (P4)', () => {
    const r = avaliarFundamentacao({ resposta: { recusou: false, citacoes: [] }, contexto });

    expect(r).toMatchObject({ ok: false, motivos: ['sem_citacao'] });
  });

  it('resposta com citação inválida FALHA, listando os motivos', () => {
    const r = avaliarFundamentacao({
      resposta: { recusou: false, citacoes: [boa, { ...boa, doc_id: 9 }] },
      contexto,
    });

    expect(r.ok).toBe(false);
    expect(r.motivos).toEqual(['doc_fora_do_contexto']);
  });

  it('todas as citações válidas → ok', () => {
    expect(
      avaliarFundamentacao({ resposta: { recusou: false, citacoes: [boa] }, contexto })
    ).toMatchObject({ ok: true, validas: 1, total: 1 });
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
