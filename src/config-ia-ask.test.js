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

describe('config das perguntas de IA', () => {
  it('desligado por padrão (kill-switch) e com tetos padrão', () => {
    const c = carregarConfig({
      AI_ASK_ENABLED: undefined,
      AI_ASK_DAILY_LIMIT: undefined,
      AI_ASK_LIMIAR: undefined,
    });

    expect(c.aiAskEnabled).toBe(false);
    expect(c.aiAskDailyLimit).toBe(300);
    expect(c.aiAskLimiar).toBe(0.2);
  });

  it.each(['abc', '', 'NaN', 'Infinity'])(
    'valor inválido (%p) cai no padrão: o teto diário nunca vira NaN',
    valor => {
      const c = carregarConfig({ AI_ASK_DAILY_LIMIT: valor, AI_ASK_LIMIAR: valor });

      expect(c.aiAskDailyLimit).toBe(300);
      expect(c.aiAskLimiar).toBe(0.2);
    }
  );

  it('valor válido é respeitado, inclusive 0 para o limiar', () => {
    const c = carregarConfig({ AI_ASK_DAILY_LIMIT: '50', AI_ASK_LIMIAR: '0' });

    expect(c.aiAskDailyLimit).toBe(50);
    expect(c.aiAskLimiar).toBe(0);
  });
});
