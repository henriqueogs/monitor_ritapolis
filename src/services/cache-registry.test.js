'use strict';

const { registrar, invalidarTodos } = require('./cache-registry');

describe('cache-registry', () => {
  it('invalidarTodos() chama invalidate() de todo memo registrado', () => {
    const memoA = { invalidate: jest.fn() };
    const memoB = { invalidate: jest.fn() };
    registrar(memoA);
    registrar(memoB);

    invalidarTodos();

    expect(memoA.invalidate).toHaveBeenCalledTimes(1);
    expect(memoB.invalidate).toHaveBeenCalledTimes(1);
  });

  it('registrar() retorna o proprio memo, pra permitir uso inline', () => {
    const memo = { invalidate: jest.fn() };
    expect(registrar(memo)).toBe(memo);
  });
});
