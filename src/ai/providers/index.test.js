'use strict';

jest.mock('./nvidia-provider', () => ({
  NvidiaProvider: jest.fn().mockImplementation((cfg) => ({ ...cfg, provider: 'nvidia' })),
}));
jest.mock('../../config', () => ({
  aiProvider: 'nvidia',
  nvidiaApiKey: null,
  nvidiaBaseUrl: undefined,
  nvidiaModel: 'nvidia/nemotron-3-nano-30b-a3b',
  nvidiaEmbedModel: 'baai/bge-m3',
  aiRequestTimeoutMs: 120000,
}));

const { NvidiaProvider } = require('./nvidia-provider');
const { createAiProvider } = require('./index');

function env(overrides = {}) {
  return { NVIDIA_API_KEY: 'chave', ...overrides };
}

describe('createAiProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('usa NVIDIA_MODEL do env por padrao', () => {
    createAiProvider(env({ NVIDIA_MODEL: 'nvidia/nemotron-3-nano-30b-a3b' }));
    expect(NvidiaProvider).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'nvidia/nemotron-3-nano-30b-a3b' })
    );
  });

  it('permite override de modelo por chamada (roteamento por tarefa)', () => {
    createAiProvider(env({ NVIDIA_MODEL: 'nvidia/nemotron-3-nano-30b-a3b' }), {
      model: 'nvidia/nemotron-3-super-120b-a12b',
    });
    expect(NvidiaProvider).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'nvidia/nemotron-3-super-120b-a12b' })
    );
  });

  it('lanca erro sem NVIDIA_API_KEY', () => {
    expect(() => createAiProvider({})).toThrow(/NVIDIA_API_KEY/);
  });

  it('lanca erro para provider nao suportado', () => {
    expect(() => createAiProvider(env({ AI_PROVIDER: 'openai' }))).toThrow(/nao suportado/);
  });
});
