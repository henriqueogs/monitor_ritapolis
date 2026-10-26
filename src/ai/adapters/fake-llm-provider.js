'use strict';

/** LLMProvider falso: devolve uma resposta fixa (ou falha). Para testes e para o eval offline. */
function criarFakeLLMProvider({ resposta = {}, falha = null, model = 'fake-llm' } = {}) {
  return {
    provider: 'fake',
    model,
    async generateJson() {
      if (falha) {
        throw falha;
      }
      return structuredClone(resposta);
    },
  };
}

module.exports = { criarFakeLLMProvider };
