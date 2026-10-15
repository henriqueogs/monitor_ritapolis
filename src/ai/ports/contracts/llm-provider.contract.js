'use strict';

/**
 * Contrato da porta LLMProvider (geração com saída JSON).
 * generateJson({ prompt, temperature?, timeoutMs?, maxRetries? }) → Promise<object>
 * Propriedades: provider (string), model (string).
 * Usa as globais do Jest: chame de dentro de um arquivo *.test.js.
 */

const { assertLLMProvider } = require('../llm-provider');

/**
 * @param {string} nome
 * @param {{ criar: Function, criarFalho?: Function }} fabricas
 */
function runLLMProviderContract(nome, { criar, criarFalho }) {
  describe(`contrato LLMProvider: ${nome}`, () => {
    it('satisfaz a porta (provider, model e generateJson)', () => {
      expect(() => assertLLMProvider(criar())).not.toThrow();
    });

    it('generateJson resolve para um objeto já interpretado', async () => {
      const r = await criar().generateJson({ prompt: 'responda em JSON' });

      expect(r).not.toBeNull();
      expect(typeof r).toBe('object');
    });

    it('aceita opções de temperatura, timeout e retries sem quebrar', async () => {
      const r = await criar().generateJson({
        prompt: 'x',
        temperature: 0,
        timeoutMs: 1000,
        maxRetries: 0,
      });

      expect(typeof r).toBe('object');
    });

    if (criarFalho) {
      it('não engole falhas do provedor: rejeita', async () => {
        await expect(criarFalho().generateJson({ prompt: 'x' })).rejects.toThrow();
      });
    }
  });
}

module.exports = { runLLMProviderContract };
