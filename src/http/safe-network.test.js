'use strict';

const { assertSafeUrl, isPrivateIp } = require('./safe-network');

describe('safe outbound network policy', () => {
  test.each([
    '127.0.0.1',
    '10.0.0.1',
    '100.64.0.1',
    '169.254.169.254',
    '172.16.0.2',
    '192.0.2.1',
    '192.168.1.1',
    '198.51.100.1',
    '203.0.113.1',
    '::1',
    'fd00::1',
    'fe80::1',
    '2001:db8::1',
    '::ffff:127.0.0.1',
  ])(
    'blocks private or reserved IP %s',
    (ip) => expect(isPrivateIp(ip)).toBe(true)
  );

  test.each(['1.1.1.1', '8.8.8.8', '2606:4700:4700::1111'])(
    'allows globally routable IP %s',
    (ip) => expect(isPrivateIp(ip)).toBe(false)
  );

  test('requires HTTPS and rejects embedded credentials', () => {
    expect(() => assertSafeUrl('http://example.com/file.pdf')).toThrow(/HTTPS/);
    expect(() => assertSafeUrl('https://user:pass@example.com/file.pdf')).toThrow(/credenciais/);
  });

  test('supports an explicit hostname allowlist', () => {
    expect(assertSafeUrl('https://api.pncp.gov.br/v1', { allowedHosts: ['pncp.gov.br'] }).hostname).toBe('api.pncp.gov.br');
    expect(() => assertSafeUrl('https://example.com', { allowedHosts: ['pncp.gov.br'] })).toThrow(/nao permitido/);
  });
});
