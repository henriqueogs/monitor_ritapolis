'use strict';

function carregarConfig(env) {
  const guardado = {};
  for (const [k, v] of Object.entries(env)) {
    guardado[k] = process.env[k];
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
  try {
    let config;
    jest.isolateModules(() => {
      config = require('./config');
    });
    return config;
  } finally {
    for (const [k, v] of Object.entries(guardado)) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
  }
}

describe('modelo de IA padrão (config.nvidiaModel)', () => {
  it('sem NVIDIA_MODEL, usa nemotron-3-ultra (o nemotron-3-super perdeu acesso em 20/10/2026)', () => {
    const c = carregarConfig({ NVIDIA_MODEL: undefined });

    expect(c.nvidiaModel).toBe('nvidia/nemotron-3-ultra-550b-a55b');
  });

  it('NVIDIA_MODEL do ambiente continua tendo precedência', () => {
    const c = carregarConfig({ NVIDIA_MODEL: 'outro/modelo' });

    expect(c.nvidiaModel).toBe('outro/modelo');
  });

  it('o modelo de embedding não muda junto', () => {
    const c = carregarConfig({ NVIDIA_MODEL: undefined, NVIDIA_EMBED_MODEL: undefined });

    expect(c.nvidiaEmbedModel).toBe('nvidia/nemotron-3-embed-1b');
  });
});
