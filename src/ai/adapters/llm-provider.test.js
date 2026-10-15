'use strict';

const { runLLMProviderContract } = require('../ports/contracts/llm-provider.contract');
const { assertLLMProvider } = require('../ports/llm-provider');
const { RespostaNaoJsonError } = require('../ports/json-resposta');
const { criarFakeLLMProvider } = require('./fake-llm-provider');
const { criarLLMProviderCompat } = require('./llm-provider-compat');

// Provedor "legado" no formato atual: generateJson devolve TEXTO (a interpretação ficava com cada chamador).
function legado(texto, { falha } = {}) {
  return {
    provider: 'nvidia',
    model: 'nvidia/nemotron-3-super',
    generateJson: jest.fn(async () => {
      if (falha) {throw falha;}
      return texto;
    }),
  };
}

runLLMProviderContract('fake', {
  criar: () => criarFakeLLMProvider({ resposta: { resumo: 'ok' } }),
  criarFalho: () => criarFakeLLMProvider({ falha: new Error('provedor fora do ar') }),
});

runLLMProviderContract('compat sobre o provedor atual (texto → objeto)', {
  criar: () => criarLLMProviderCompat(legado('```json\n{"ok":true}\n```')),
  criarFalho: () => criarLLMProviderCompat(legado('', { falha: new Error('429') })),
});

describe('assertLLMProvider', () => {
  it('rejeita objetos que não cumprem a porta', () => {
    expect(() => assertLLMProvider(null)).toThrow(TypeError);
    expect(() => assertLLMProvider({ provider: 'x', model: 'y' })).toThrow(/generateJson/);
    expect(() => assertLLMProvider({ generateJson: () => {}, provider: 'x' })).toThrow(/model/);
  });
});

describe('criarLLMProviderCompat', () => {
  it('repassa as opções ao provedor legado', async () => {
    const base = legado('{"a":1}');

    await criarLLMProviderCompat(base).generateJson({ prompt: 'p', temperature: 0, timeoutMs: 500, maxRetries: 1 });

    expect(base.generateJson).toHaveBeenCalledWith({ prompt: 'p', temperature: 0, timeoutMs: 500, maxRetries: 1 });
  });

  it('resposta que não é JSON vira RespostaNaoJsonError (e não um objeto vazio)', async () => {
    const p = criarLLMProviderCompat(legado('desculpe, não consegui'));

    await expect(p.generateJson({ prompt: 'x' })).rejects.toBeInstanceOf(RespostaNaoJsonError);
  });

  it('erro do provedor propaga com o modelo no contexto e a causa preservada', async () => {
    const causa = new Error('429');
    const p = criarLLMProviderCompat(legado('', { falha: causa }));

    await expect(p.generateJson({ prompt: 'x' })).rejects.toMatchObject({
      message: expect.stringContaining('nvidia/nemotron-3-super'),
      cause: causa,
    });
  });
});
