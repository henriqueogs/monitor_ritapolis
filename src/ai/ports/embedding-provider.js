'use strict';

/**
 * Porta EmbeddingProvider.
 *   embed(textos: string[], { tipo?: 'passage' | 'query' }) → Promise<number[][]>
 *   model: string · dims: inteiro > 0
 * Falhas tipadas: ver ./errors. Contrato executável: ./contracts/embedding-provider.contract.js
 */

const { ModeloIndisponivelError, ProviderLimiteError } = require('./errors');

const TIPOS_EMBEDDING = Object.freeze({ PASSAGE: 'passage', QUERY: 'query' });

function validarTipo(tipo) {
  if (!Object.values(TIPOS_EMBEDDING).includes(tipo)) {
    throw new TypeError(
      `tipo de embedding inválido: ${tipo} (use ${Object.values(TIPOS_EMBEDDING).join(' ou ')})`
    );
  }
  return tipo;
}

/** Entrada válida: lista de textos não vazios. Falha rápida, sem gastar chamada ao provedor. */
function validarTextos(textos) {
  if (!Array.isArray(textos)) {
    throw new TypeError('textos deve ser uma lista de strings');
  }
  textos.forEach((t, i) => {
    if (typeof t !== 'string' || !t.trim()) {
      throw new TypeError(`texto inválido na posição ${i}: string não vazia esperada`);
    }
  });
  return textos;
}

/**
 * Sonda barata (um texto) para saber se o modelo está vivo ANTES de uma indexação longa.
 * Nunca lança por modelo morto/limite: devolve o motivo. Outros erros propagam.
 */
async function verificarModelo(provider) {
  try {
    const [vetor] = await provider.embed(['ping'], { tipo: TIPOS_EMBEDDING.QUERY });
    return { ok: true, modelo: provider.model, dims: vetor.length };
  } catch (err) {
    if (err instanceof ModeloIndisponivelError) {
      return { ok: false, modelo: provider.model, motivo: 'modelo_indisponivel' };
    }
    if (err instanceof ProviderLimiteError) {
      return {
        ok: false,
        modelo: provider.model,
        motivo: 'limite_de_taxa',
        retryAfterMs: err.retryAfterMs,
      };
    }
    throw err;
  }
}

module.exports = { TIPOS_EMBEDDING, validarTipo, validarTextos, verificarModelo };
