'use strict';

/**
 * Eval de identificadores de documento (N/AAAA): perguntas que citam o número ("Decreto nº 3/2025").
 * O vetor sozinho não distingue 3/2025 de 30/2025 ou 13/2025 (o embedding vê palavras e anos); o ramo
 * lexical com o identificador como frase resolve. Corpus propositalmente cheio de vizinhos do mesmo
 * ano e do mesmo texto. Achado real: em produção, "Decreto nº 3/2025" não foi achado (21/10/2026).
 */

const corpus = require('./corpus-identificadores.json');
const dataset = require('./dataset-identificadores.json');
const { criarFakeEmbeddingProvider } = require('../../src/ai/adapters/fake-embedding-provider');
const { criarMemoryVectorStore } = require('../../src/ai/vector/memory-vector-store');
const { criarSqliteVecStore, abrirBancoVetorial } = require('../../src/ai/vector/sqlite-vec-store');
const {
  indexarCorpus,
  criarRecuperadorVetorial,
} = require('../../src/ai/eval/recuperador-vetorial');
const { criarRecuperadorHibrido } = require('../../src/ai/rag/recuperador-hibrido');
const { rodarEvalRecuperacao } = require('../../src/ai/eval/eval-recuperacao');

const K = 3;

const CRIADORES = {
  memória: provider => criarMemoryVectorStore({ dims: provider.dims, quantizacao: 'int8' }),
  'sqlite-vec': provider =>
    criarSqliteVecStore({
      db: abrirBancoVetorial(':memory:'),
      dims: provider.dims,
      quantizacao: 'int8',
    }),
};

describe.each(Object.keys(CRIADORES))('eval de identificadores de documento [%s]', nomeStore => {
  async function montar() {
    const provider = criarFakeEmbeddingProvider();
    const store = CRIADORES[nomeStore](provider);
    await indexarCorpus({ provider, store, corpus });
    return { provider, store };
  }

  it('híbrido acha o documento exato em 1º lugar em todas as perguntas', async () => {
    const { provider, store } = await montar();

    const { resumo, perguntas } = await rodarEvalRecuperacao({
      dataset,
      k: K,
      recuperar: criarRecuperadorHibrido({ provider, store }),
    });

    expect(perguntas.map(p => ({ id: p.id, rr: p.rr }))).toEqual(
      dataset.map(d => ({ id: d.id, rr: 1 }))
    );
    expect(resumo.recall_medio).toBe(1);
    expect(resumo.mrr).toBe(1);
  });

  it('o vetor sozinho NÃO resolve (o ganho é do ramo lexical)', async () => {
    const { provider, store } = await montar();

    const { resumo } = await rodarEvalRecuperacao({
      dataset,
      k: K,
      recuperar: criarRecuperadorVetorial({ provider, store }),
    });

    expect(resumo.mrr).toBeLessThan(1);
  });
});
