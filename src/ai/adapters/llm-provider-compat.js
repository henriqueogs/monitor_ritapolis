'use strict';

/**
 * Adapta o provedor atual (src/ai/providers, cujo generateJson devolve TEXTO) à porta
 * LLMProvider (objeto já interpretado). Não altera o provedor existente.
 */

const { extrairObjetoJson } = require('../ports/json-resposta');
const { classificarErroProvider } = require('../ports/errors');

const ehObjetoSimples = v => v !== null && typeof v === 'object' && !Array.isArray(v);

function criarLLMProviderCompat(legado) {
  if (typeof legado?.generateJson !== 'function') {
    throw new TypeError('provedor legado precisa de generateJson()');
  }

  return {
    provider: legado.provider || 'compat',
    model: legado.model,
    async generateJson(opcoes) {
      let resposta;
      try {
        resposta = await legado.generateJson(opcoes);
      } catch (err) {
        throw classificarErroProvider(err, { modelo: legado.model });
      }
      return ehObjetoSimples(resposta) ? resposta : extrairObjetoJson(resposta);
    },
  };
}

module.exports = { criarLLMProviderCompat };
