'use strict';

const { runEmbeddingProviderContract } = require('../ports/contracts/embedding-provider.contract');
const { criarFakeEmbeddingProvider } = require('./fake-embedding-provider');
const { cosseno } = require('../vector/quantizacao');

runEmbeddingProviderContract('fake (hash de palavras)', {
  criar: () => criarFakeEmbeddingProvider(),
  criarMorto: () => criarFakeEmbeddingProvider({ falha: 'modelo_morto' }),
  criarLimitado: () => criarFakeEmbeddingProvider({ falha: 'limite' }),
});

describe('fake-embedding-provider: semântica mínima para testes de recuperação', () => {
  const p = criarFakeEmbeddingProvider();

  it('textos que compartilham palavras ficam mais próximos que textos sem relação', async () => {
    const [consulta, parecido, distante] = await p.embed([
      'vencedor do pregão de merenda escolar',
      'a empresa foi declarada vencedora do pregão para merenda escolar',
      'decreto altera horário de funcionamento das repartições no feriado',
    ]);

    expect(cosseno(consulta, parecido)).toBeGreaterThan(cosseno(consulta, distante));
  });

  it('ignora acentos e maiúsculas', async () => {
    const [a, b] = await p.embed(['Licitação ÚNICA', 'licitacao unica']);

    expect(a).toEqual(b);
  });

  it('vetores saem normalizados (norma 1)', async () => {
    const [v] = await p.embed(['qualquer texto com palavras']);

    expect(Math.hypot(...v)).toBeCloseTo(1, 5);
  });
});
