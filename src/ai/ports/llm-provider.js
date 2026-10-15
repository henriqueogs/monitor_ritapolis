'use strict';

/**
 * Porta LLMProvider (geração com saída JSON).
 *   generateJson({ prompt, temperature?, timeoutMs?, maxRetries? }) → Promise<object>  (já interpretado)
 *   provider: string · model: string
 * O provedor atual (src/ai/providers) devolve TEXTO; use adapters/llm-provider-compat.js para cumprir a porta.
 * Contrato executável: ./contracts/llm-provider.contract.js
 */

function assertLLMProvider(provider) {
  if (!provider || typeof provider !== 'object') {
    throw new TypeError('LLMProvider inválido: objeto esperado');
  }
  if (typeof provider.generateJson !== 'function') {
    throw new TypeError('LLMProvider inválido: falta generateJson()');
  }
  if (typeof provider.provider !== 'string') {
    throw new TypeError('LLMProvider inválido: falta provider (string)');
  }
  if (typeof provider.model !== 'string') {
    throw new TypeError('LLMProvider inválido: falta model (string)');
  }
  return provider;
}

module.exports = { assertLLMProvider };
