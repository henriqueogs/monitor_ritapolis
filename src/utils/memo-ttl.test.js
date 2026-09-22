'use strict';

const { memoTtl } = require('./memo-ttl');

describe('memoTtl', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('reaproveita o valor dentro do TTL (hit)', () => {
    const fn = jest.fn(() => Math.random());
    const memoized = memoTtl(fn, { ttlMs: 1000 });

    const primeiro = memoized();
    jest.advanceTimersByTime(500);
    const segundo = memoized();

    expect(segundo).toBe(primeiro);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('recalcula apos o TTL expirar (miss)', () => {
    const fn = jest.fn(() => Math.random());
    const memoized = memoTtl(fn, { ttlMs: 1000 });

    memoized();
    jest.advanceTimersByTime(1001);
    memoized();

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('invalidate() forca recomputo mesmo dentro do TTL', () => {
    const fn = jest.fn(() => Math.random());
    const memoized = memoTtl(fn, { ttlMs: 10000 });

    memoized();
    memoized.invalidate();
    memoized();

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('chaves diferentes nao colidem', () => {
    const fn = jest.fn((x) => x * 2);
    const memoized = memoTtl(fn, { ttlMs: 1000, key: (x) => x });

    expect(memoized(1)).toBe(2);
    expect(memoized(2)).toBe(4);
    expect(memoized(1)).toBe(2);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
