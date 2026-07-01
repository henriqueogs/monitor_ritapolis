'use strict';

function getAdminCredentials(env = process.env) {
  const user = String(env.ADMIN_AUTH_USER || '').trim();
  const password = String(env.ADMIN_AUTH_PASSWORD || '');

  if (!user || !password) {
    return null;
  }

  return { user, password };
}

function isAdminAuthEnabled(env = process.env) {
  return Boolean(getAdminCredentials(env));
}

function decodeBase64(value) {
  if (typeof atob === 'function') {
    return atob(value);
  }
  return Buffer.from(value, 'base64').toString('utf8');
}

function parseBasicAuthHeader(header) {
  const value = String(header || '');
  const match = value.match(/^Basic\s+(.+)$/i);

  if (!match) {
    return null;
  }

  try {
    const decoded = decodeBase64(match[1]);
    const separator = decoded.indexOf(':');

    if (separator <= 0) {
      return null;
    }

    return {
      user: decoded.slice(0, separator),
      password: decoded.slice(separator + 1)
    };
  } catch {
    return null;
  }
}

function isAuthorizedBasicAuth(header, env = process.env) {
  const expected = getAdminCredentials(env);

  if (!expected) {
    return true;
  }

  const provided = parseBasicAuthHeader(header);
  return provided?.user === expected.user && provided?.password === expected.password;
}

module.exports = {
  getAdminCredentials,
  isAdminAuthEnabled,
  isAuthorizedBasicAuth,
  parseBasicAuthHeader
};
