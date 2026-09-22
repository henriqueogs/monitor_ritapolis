'use strict';

// Memoiza uma funcao sincrona por TTL. `key(...args)` decide a chave do cache
// (default: chave unica, ignora args). `.invalidate(key?)` limpa uma entrada
// especifica ou tudo, se chamado sem argumento.
function memoTtl(fn, { ttlMs, key = () => '__default__' } = {}) {
  const cache = new Map();

  function memoized(...args) {
    const cacheKey = key(...args);
    const now = Date.now();
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.value;
    }

    const value = fn(...args);
    cache.set(cacheKey, { value, expiresAt: now + ttlMs });
    return value;
  }

  memoized.invalidate = (cacheKey) => {
    if (cacheKey === undefined) {
      cache.clear();
      return;
    }
    cache.delete(cacheKey);
  };

  return memoized;
}

module.exports = { memoTtl };
