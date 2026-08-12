'use strict';

const { assertSafeUrl } = require('./safe-network');

const SUPPORTED_METHODS = new Set(['get', 'post']);

function collectorProxyConfigured(env = process.env) {
  const proxyUrl = String(env.COLLECTOR_PROXY_URL || '').trim();
  const proxyToken = String(env.COLLECTOR_PROXY_TOKEN || '').trim();

  if (Boolean(proxyUrl) !== Boolean(proxyToken)) {
    throw new Error('Proxy de coleta configurado parcialmente');
  }

  return Boolean(proxyUrl && proxyToken);
}

function proxyCollectorRequest({ method, url, data, options = {}, env = process.env }) {
  assertSafeUrl(url);

  if (!collectorProxyConfigured(env)) {
    return { method, url, data, options };
  }

  const normalizedMethod = String(method || '').toLowerCase();
  if (!SUPPORTED_METHODS.has(normalizedMethod)) {
    throw new Error(`Metodo nao suportado pelo proxy de coleta: ${method}`);
  }

  const proxyUrl = String(env.COLLECTOR_PROXY_URL).trim();
  assertSafeUrl(proxyUrl);

  return {
    method: normalizedMethod,
    url: proxyUrl,
    data,
    options: {
      ...options,
      headers: {
        ...(options.headers || {}),
        authorization: `Bearer ${String(env.COLLECTOR_PROXY_TOKEN).trim()}`,
        'x-target-url': url,
      },
      maxRedirects: 0,
    },
  };
}

function isRetryableCollectorError(error) {
  const status = Number(error?.response?.status || 0);
  if (!status) {
    return true;
  }
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

module.exports = {
  collectorProxyConfigured,
  isRetryableCollectorError,
  proxyCollectorRequest,
};
