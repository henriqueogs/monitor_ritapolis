'use strict';

// Limitador por IP + categoria de rota. Duas janelas: uma curta (rajada) que
// contém picos instantâneos (clique duplicado, script), e uma de 15min que
// contém abuso sustentado. `classifyRequest` vem de security.js — cada rota
// já é classificada lá (publicRead/search/auth/adminRead/adminWrite/expensiveJob).

const RATE_WINDOW_MS = 15 * 60 * 1000;
const BURST_WINDOW_MS = 10 * 1000;
const MAX_RATE_LIMIT_ENTRIES = 20000;
const CLEANUP_INTERVAL_REQUESTS = 500;

const buckets = new Map();
let requestsSinceCleanup = 0;

function getRateLimit(classification, env = process.env) {
  const defaults = {
    publicRead: 600,
    search: 120,
    auth: 20,
    adminRead: 180,
    adminWrite: 60,
    expensiveJob: 20,
  };
  const key = `RATE_LIMIT_${classification.toUpperCase()}`;
  return Math.max(Number(env[key] || defaults[classification] || 300), 1);
}

function getBurstLimit(classification, env = process.env) {
  const defaults = {
    publicRead: 40,
    search: 15,
    auth: 5,
    adminRead: 20,
    adminWrite: 10,
    expensiveJob: 3,
  };
  const key = `BURST_LIMIT_${classification.toUpperCase()}`;
  return Math.max(Number(env[key] || defaults[classification] || 30), 1);
}

function isBucketExpired(entry, now) {
  return entry.windowResetAt <= now && entry.burstResetAt <= now;
}

// `buckets` nunca esquece uma chave sozinho — sem isso, cada IP distinto que
// já passou por aqui uma vez fica pra sempre em memória (vazamento sob
// ataque distribuído). Chamado periodicamente, não a cada requisição, pra
// não pagar o custo de varrer o Map em todo request.
function purgeExpiredBuckets(now) {
  for (const [key, entry] of buckets) {
    if (isBucketExpired(entry, now)) {
      buckets.delete(key);
    }
  }
}

function getOrCreateBucket(key, now) {
  const existing = buckets.get(key);
  if (existing) {
    // Reinsere pra manter a ordem do Map como LRU aproximado (usado no descarte abaixo).
    buckets.delete(key);
    buckets.set(key, existing);
    return existing;
  }

  if (buckets.size >= MAX_RATE_LIMIT_ENTRIES) {
    const oldestKey = buckets.keys().next().value;
    if (oldestKey !== undefined) {
      buckets.delete(oldestKey);
    }
  }

  const created = { count: 0, windowResetAt: now + RATE_WINDOW_MS, burstCount: 0, burstResetAt: now + BURST_WINDOW_MS };
  buckets.set(key, created);
  return created;
}

function createRateLimiter(classifyRequest) {
  return function rateLimit(req, res, next) {
    const classification = classifyRequest(req);
    const limit = getRateLimit(classification);
    const burstLimit = getBurstLimit(classification);
    const key = `${classification}:${req.ip || req.socket?.remoteAddress || 'unknown'}`;
    const now = Date.now();

    requestsSinceCleanup += 1;
    if (requestsSinceCleanup >= CLEANUP_INTERVAL_REQUESTS) {
      requestsSinceCleanup = 0;
      purgeExpiredBuckets(now);
    }

    const entry = getOrCreateBucket(key, now);
    if (entry.windowResetAt <= now) {
      entry.count = 0;
      entry.windowResetAt = now + RATE_WINDOW_MS;
    }
    if (entry.burstResetAt <= now) {
      entry.burstCount = 0;
      entry.burstResetAt = now + BURST_WINDOW_MS;
    }

    entry.count += 1;
    entry.burstCount += 1;

    if (entry.burstCount > burstLimit) {
      res.setHeader('Retry-After', Math.ceil((entry.burstResetAt - now) / 1000));
      return res.status(429).json({ error: 'Muitas requisicoes; aguarde alguns segundos' });
    }

    if (entry.count > limit) {
      res.setHeader('Retry-After', Math.ceil((entry.windowResetAt - now) / 1000));
      return res.status(429).json({ error: 'Muitas requisicoes; tente novamente em instantes' });
    }

    return next();
  };
}

function resetRateLimitForTests() {
  buckets.clear();
  requestsSinceCleanup = 0;
}

function getRateLimitBucketSize() {
  return buckets.size;
}

module.exports = {
  createRateLimiter,
  getRateLimitBucketSize,
  MAX_RATE_LIMIT_ENTRIES,
  resetRateLimitForTests,
};
