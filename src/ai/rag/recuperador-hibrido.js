'use strict';

/**
 * Recuperador híbrido (ADR 0003): ramo vetorial + ramo lexical (BM25) em paralelo, fundidos por RRF.
 * O `score` de cada resultado continua sendo o cosseno com a pergunta (mesmo sinal de evidência do
 * recuperador vetorial, usado pelo limiar do eval); a ordem vem do RRF (`scoreRrf`, `ramos`).
 * Store sem `searchLexical` degrada para vetor puro.
 */

const { TIPOS_EMBEDDING } = require('../ports/embedding-provider');
const { fundirRRF } = require('./rrf');

const K_PADRAO = 10;
const FATOR_CANDIDATOS_PADRAO = 5;

function criarRecuperadorHibrido({ provider, store, fatorCandidatos = FATOR_CANDIDATOS_PADRAO }) {
  return async (pergunta, { k = K_PADRAO, filtros } = {}) => {
    const [vetor] = await provider.embed([pergunta], { tipo: TIPOS_EMBEDDING.QUERY });
    const candidatos = k * fatorCandidatos;
    const [porVetor, porTexto] = await Promise.all([
      store.search({ vetor, k: candidatos, filtros }),
      typeof store.searchLexical === 'function'
        ? store.searchLexical({ consulta: pergunta, vetor, k: candidatos, filtros })
        : [],
    ]);
    return fundirRRF(
      [
        { nome: 'vetor', itens: porVetor },
        { nome: 'lexical', itens: porTexto },
      ],
      { limite: k }
    );
  };
}

module.exports = { criarRecuperadorHibrido };
