'use strict';

/**
 * Gate da recuperação HÍBRIDA (ADR 0003/0006) sobre o adaptador real sqlite-vec (FTS5 + vec0):
 * não pode ficar abaixo do vetor puro e deve atingir os mesmos limiares. Offline, embedder falso.
 */

const corpus = require('./corpus-fixture.json');
const dataset = require('./dataset-ouro.json');
const { criarFakeEmbeddingProvider } = require('../../src/ai/adapters/fake-embedding-provider');
const { criarSqliteVecStore, abrirBancoVetorial } = require('../../src/ai/vector/sqlite-vec-store');
const {
  indexarCorpus,
  criarRecuperadorVetorial,
} = require('../../src/ai/eval/recuperador-vetorial');
const { criarRecuperadorHibrido } = require('../../src/ai/rag/recuperador-hibrido');
const { rodarEvalRecuperacao, verificarLimiares } = require('../../src/ai/eval/eval-recuperacao');

const LIMIARES = { recall_medio: 1, mrr: 0.75, recusa_correta_pct: 1 };

async function montar(quantizacao) {
  const provider = criarFakeEmbeddingProvider();
  const store = criarSqliteVecStore({
    db: abrirBancoVetorial(':memory:'),
    dims: provider.dims,
    quantizacao,
  });
  await indexarCorpus({ provider, store, corpus });
  return { provider, store };
}

describe.each(['float32', 'int8'])('eval de recuperação híbrida — sqlite-vec [%s]', quantizacao => {
  it('atinge os limiares do gate e não perde para o vetor puro', async () => {
    const { provider, store } = await montar(quantizacao);

    const hibrido = await rodarEvalRecuperacao({
      dataset,
      recuperar: criarRecuperadorHibrido({ provider, store }),
    });
    const vetor = await rodarEvalRecuperacao({
      dataset,
      recuperar: criarRecuperadorVetorial({ provider, store }),
    });

    expect(verificarLimiares(hibrido.resumo, LIMIARES)).toEqual({ passou: true, falhas: [] });
    expect(hibrido.resumo.recall_medio).toBeGreaterThanOrEqual(vetor.resumo.recall_medio);
    expect(hibrido.resumo.mrr).toBeGreaterThanOrEqual(vetor.resumo.mrr);
  });
});
