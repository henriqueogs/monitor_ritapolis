'use strict';

const {
  ModeloIndisponivelError,
  ProviderLimiteError,
  DimensaoInesperadaError,
  classificarErroProvider,
} = require('./errors');

describe('classificarErroProvider', () => {
  const modelo = 'nvidia/nemotron-3-embed-1b';

  it.each([410, 404])(
    'status %s vira ModeloIndisponivelError (modelo morto ou sem acesso)',
    status => {
      const original = Object.assign(new Error(`${status} status code (no body)`), { status });

      const erro = classificarErroProvider(original, { modelo });

      expect(erro).toBeInstanceOf(ModeloIndisponivelError);
      expect(erro).toMatchObject({ modelo, status });
      expect(erro.cause).toBe(original);
      expect(erro.message).toContain(modelo);
    }
  );

  it('429 vira ProviderLimiteError e lê o Retry-After (segundos) em ms', () => {
    const original = Object.assign(new Error('429'), {
      status: 429,
      headers: { 'retry-after': '3' },
    });

    const erro = classificarErroProvider(original, { modelo });

    expect(erro).toBeInstanceOf(ProviderLimiteError);
    expect(erro.retryAfterMs).toBe(3000);
  });

  it('429 sem Retry-After deixa retryAfterMs nulo (o chamador decide o recuo)', () => {
    const erro = classificarErroProvider(Object.assign(new Error('429'), { status: 429 }), {
      modelo,
    });

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

describe('Retry-After', () => {
  const com429 = headers =>
    classificarErroProvider(Object.assign(new Error('429'), { status: 429, headers }), {
      modelo: 'm',
    });

  it('vazio, negativo ou lixo → desconhecido (null), nunca 0', () => {
    expect(com429({ 'retry-after': '' }).retryAfterMs).toBeNull();
    expect(com429({ 'retry-after': '-5' }).retryAfterMs).toBeNull();
    expect(com429({ 'retry-after': 'abc' }).retryAfterMs).toBeNull();
  });

  it('data HTTP vira milissegundos até a data', () => {
    const daqui5s = new Date(Date.now() + 5000).toUTCString();

    const ms = com429({ 'retry-after': daqui5s }).retryAfterMs;

    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(5000);
  });

  it('data HTTP no passado → null', () => {
    expect(
      com429({ 'retry-after': new Date(Date.now() - 60000).toUTCString() }).retryAfterMs
    ).toBeNull();
  });

  it('chave em outra caixa e Headers do SDK também são lidos', () => {
    expect(com429({ 'Retry-After': '4' }).retryAfterMs).toBe(4000);
    expect(com429(new Headers({ 'retry-after': '2' })).retryAfterMs).toBe(2000);
  });
});

describe('erro genérico', () => {
  it('preserva o status HTTP para o chamador decidir entre tentar de novo e falha permanente', () => {
    const erro = classificarErroProvider(Object.assign(new Error('x'), { status: 503 }), {
      modelo: 'm',
    });

    expect(erro.status).toBe(503);
  });
});
