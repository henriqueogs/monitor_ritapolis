'use strict';

jest.mock('./safe-network', () => ({ assertSafeUrl: jest.fn() }));

const {
  collectorProxyConfigured,
  isRetryableCollectorError,
  proxyCollectorRequest,
} = require('./collector-proxy');

const env = {
  COLLECTOR_PROXY_URL: 'https://proxy.example.workers.dev/proxy',
  COLLECTOR_PROXY_TOKEN: 'secret-token',
};

describe('collector proxy', () => {
  test('mantem a requisicao direta quando o proxy nao esta configurado', () => {
    expect(
      proxyCollectorRequest({ method: 'get', url: 'https://example.com/a', env: {} })
    ).toMatchObject({
      method: 'get',
      url: 'https://example.com/a',
    });
  });

  test('encaminha destino e segredo sem alterar o corpo', () => {
    const routed = proxyCollectorRequest({
      method: 'post',
      url: 'https://ritapolis.mg.gov.br/ws',
      data: 'a=1',
      options: { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      env,
    });

    expect(routed).toMatchObject({
      method: 'post',
      url: env.COLLECTOR_PROXY_URL,
      data: 'a=1',
      options: {
        maxRedirects: 0,
        headers: {
          authorization: 'Bearer secret-token',
          'x-target-url': 'https://ritapolis.mg.gov.br/ws',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    });
  });

  test('rejeita configuracao parcial e metodos fora da lista', () => {
    expect(() =>
      collectorProxyConfigured({ COLLECTOR_PROXY_URL: env.COLLECTOR_PROXY_URL })
    ).toThrow('parcialmente');
    expect(() =>
      proxyCollectorRequest({ method: 'delete', url: 'https://example.com', env })
    ).toThrow('nao suportado');
  });

  test('nao repete erros HTTP permanentes', () => {
    expect(isRetryableCollectorError({ response: { status: 403 } })).toBe(false);
    expect(isRetryableCollectorError({ response: { status: 429 } })).toBe(true);
    expect(isRetryableCollectorError({ response: { status: 503 } })).toBe(true);
    expect(isRetryableCollectorError({ code: 'ETIMEDOUT' })).toBe(true);
  });
});
