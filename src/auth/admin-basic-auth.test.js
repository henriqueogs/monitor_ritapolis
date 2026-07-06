'use strict';

const {
  getAdminCredentials,
  isAdminAuthEnabled,
  isAuthorizedBasicAuth,
  parseBasicAuthHeader,
  getAdminAuthState
} = require('./admin-basic-auth');

function basic(user, password) {
  return `Basic ${Buffer.from(`${user}:${password}`, 'utf8').toString('base64')}`;
}

describe('admin basic auth', () => {
  test('stays disabled when credentials are not configured', () => {
    expect(getAdminCredentials({})).toBeNull();
    expect(getAdminCredentials({ ADMIN_AUTH_USER: 'admin' })).toBeNull();
    expect(getAdminCredentials({ ADMIN_AUTH_PASSWORD: 'secret' })).toBeNull();
    expect(isAdminAuthEnabled({})).toBe(false);
    expect(isAuthorizedBasicAuth(null, {})).toBe(true);
    expect(isAuthorizedBasicAuth(null, { NODE_ENV: 'production' })).toBe(false);
    expect(getAdminAuthState({ NODE_ENV: 'production' })).toEqual({
      configured: false,
      production: true
    });
  });

  test('parses a valid Basic header', () => {
    expect(parseBasicAuthHeader(basic('admin', 's3cret'))).toEqual({
      user: 'admin',
      password: 's3cret'
    });
  });

  test('rejects malformed Basic headers', () => {
    expect(parseBasicAuthHeader('Bearer token')).toBeNull();
    expect(parseBasicAuthHeader('Basic not-base64-%')).toBeNull();
    expect(parseBasicAuthHeader(`Basic ${Buffer.from('missing-colon').toString('base64')}`)).toBeNull();
  });

  test('requires matching credentials when enabled', () => {
    const env = {
      ADMIN_AUTH_USER: 'admin',
      ADMIN_AUTH_PASSWORD: 's3cret'
    };

    expect(isAdminAuthEnabled(env)).toBe(true);
    expect(isAuthorizedBasicAuth(null, env)).toBe(false);
    expect(isAuthorizedBasicAuth(basic('admin', 'wrong'), env)).toBe(false);
    expect(isAuthorizedBasicAuth(basic('other', 's3cret'), env)).toBe(false);
    expect(isAuthorizedBasicAuth(basic('admin', 's3cret'), env)).toBe(true);
  });
});
