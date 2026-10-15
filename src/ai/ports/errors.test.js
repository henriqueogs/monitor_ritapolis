'use strict';

const {
  ModeloIndisponivelError,
  ProviderLimiteError,
  DimensaoInesperadaError,
  classificarErroProvider,
} = require('./errors');

describe('classificarErroProvider', () => {
  const modelo = 'nvidia/nemotron-3-embed-1b';

  it.each([410, 404])('status %s vira ModeloIndisponivelError (modelo morto ou sem acesso)', (status) => {
    const original = Object.assign(new Error(`${status} status code (no body)`), { status });

    const erro = classificarErroProvider(original, { modelo });

    expect(erro).toBeInstanceOf(ModeloIndisponivelError);
    expect(erro).toMatchObject({ modelo, status });
    expect(erro.cause).toBe(original);
    expect(erro.message).toContain(modelo);
  });

  it('429 vira ProviderLimiteError e lê o Retry-After (segundos) em ms', () => {
    const original = Object.assign(new Error('429'), { status: 429, headers: { 'retry-after': '3' } });

    const erro = classificarErroProvider(original, { modelo });

    expect(erro).toBeInstanceOf(ProviderLimiteError);
    expect(erro.retryAfterMs).toBe(3000);
  });

  it('429 sem Retry-After deixa retryAfterMs nulo (o chamador decide o recuo)', () => {
    const erro = classificarErroProvider(Object.assign(new Error('429'), { status: 429 }), { modelo });

    expect(erro.retryAfterMs).toBeNull();
  });

  it('outros erros viram Error com contexto do modelo e a causa preservada', () => {
    const original = Object.assign(new Error('boom'), { status: 500 });

    const erro = classificarErroProvider(original, { modelo });

    expect(erro).not.toBeInstanceOf(ModeloIndisponivelError);
    expect(erro).not.toBeInstanceOf(ProviderLimiteError);
    expect(erro.message).toContain(modelo);
    expect(erro.message).toContain('boom');
    expect(erro.cause).toBe(original);
  });

  it('não reembrulha um erro de porta já classificado', () => {
    const ja = new ModeloIndisponivelError({ modelo, status: 410 });

    expect(classificarErroProvider(ja, { modelo })).toBe(ja);
  });
});

describe('DimensaoInesperadaError', () => {
  it('informa esperada e recebida', () => {
    const erro = new DimensaoInesperadaError({ modelo: 'm', esperada: 2048, recebida: 1024 });

    expect(erro.message).toContain('2048');
    expect(erro.message).toContain('1024');
  });
});
