'use strict';

const { tryAcquire, release, isLocked, getDono } = require('./scheduler-lock');

describe('scheduler-lock', () => {
  afterEach(() => {
    // Limpa estado do modulo entre testes (singleton em memoria).
    release(getDono());
  });

  it('primeiro a pedir consegue o lock', () => {
    expect(tryAcquire('collection')).toBe(true);
    expect(isLocked()).toBe(true);
    expect(getDono()).toBe('collection');
  });

  it('segundo a pedir enquanto outro segura o lock falha', () => {
    tryAcquire('collection');
    expect(tryAcquire('ai')).toBe(false);
    expect(getDono()).toBe('collection');
  });

  it('release libera o lock pro proximo pedir', () => {
    tryAcquire('collection');
    release('collection');
    expect(isLocked()).toBe(false);
    expect(tryAcquire('daily')).toBe(true);
  });

  it('release de quem nao e dono nao libera o lock de outro', () => {
    tryAcquire('collection');
    release('ai');
    expect(isLocked()).toBe(true);
    expect(getDono()).toBe('collection');
  });
});
