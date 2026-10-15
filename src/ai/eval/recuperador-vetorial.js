'use strict';

/** Cola EmbeddingProvider + VectorStore: indexa um corpus e devolve o recuperador usado pelo eval. */

const { TIPOS_EMBEDDING } = require('../ports/embedding-provider');

const TAMANHO_LOTE = 64;

/** corpus: { id, docId, texto, metadados?, url_origem? }[] */
async function indexarCorpus({ provider, store, corpus, tamanhoLote = TAMANHO_LOTE }) {
  for (let i = 0; i < corpus.length; i += tamanhoLote) {
    const lote = corpus.slice(i, i + tamanhoLote);
    const vetores = await provider.embed(
      lote.map((c) => c.texto),
      { tipo: TIPOS_EMBEDDING.PASSAGE }
    );
    await store.upsert(
      lote.map((c, idx) => ({
        id: c.id,
        docId: c.docId,
        texto: c.texto,
        metadados: { ...c.metadados, url_origem: c.url_origem },
        vetor: vetores[idx],
      }))
    );
  }
}

function criarRecuperadorVetorial({ provider, store }) {
  return async (pergunta, { k, filtros }) => {
    const [vetor] = await provider.embed([pergunta], { tipo: TIPOS_EMBEDDING.QUERY });
    return store.search({ vetor, k, filtros });
  };
}

module.exports = { indexarCorpus, criarRecuperadorVetorial };
