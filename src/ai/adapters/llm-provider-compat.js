'use strict';

/**
 * Adapta o provedor atual (src/ai/providers, cujo generateJson devolve TEXTO) à porta
 * LLMProvider (objeto já interpretado). Não altera o provedor existente.
 */

const { extrairObjetoJson } = require('../ports/json-resposta');

function criarLLMProviderCompat(legado) {
  if (typeof legado?.generateJson !== 'function') {throw new TypeError('provedor legado precisa de generateJson()');}

  return {
    provider: legado.provider || 'compat',
    model: legado.model,
    async generateJson(opcoes) {
      let resposta;
      try {
        resposta = await legado.generateJson(opcoes);
      } catch (err) {
        throw new Error(`LLM provider falhou [${legado.model}]: ${err.message}`, { cause: err });
      }
      return resposta !== null && typeof resposta === 'object' ? resposta : extrairObjetoJson(resposta);
    },
  };
}

module.exports = { criarLLMProviderCompat };
