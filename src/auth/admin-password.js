'use strict';

const crypto = require('crypto');

const KEY_LENGTH = 64;
const SCRYPT_OPTIONS = Object.freeze({ N: 16384, r: 8, p: 1 });
const HASH_PREFIX = 'scrypt';

function normalizePassword(password) {
  return String(password || '');
}

function validatePasswordStrength(password) {
  const value = normalizePassword(password);
  if (value.length < 10) {
    return { ok: false, error: 'A senha deve ter pelo menos 10 caracteres' };
  }
  if (value.length > 256) {
    return { ok: false, error: 'A senha deve ter no maximo 256 caracteres' };
  }
  return { ok: true };
}

function hashPassword(password) {
  const validation = validatePasswordStrength(password);
  if (!validation.ok) {
    throw new Error(validation.error);
  }

  const salt = crypto.randomBytes(16).toString('base64url');
  const hash = crypto
    .scryptSync(normalizePassword(password), salt, KEY_LENGTH, SCRYPT_OPTIONS)
    .toString('base64url');
  return `${HASH_PREFIX}$${salt}$${hash}`;
}

function verifyPassword(password, storedHash) {
  const parts = String(storedHash || '').split('$');
  if (parts.length !== 3 || parts[0] !== HASH_PREFIX) {
    return false;
  }

  const [, salt, expected] = parts;
  let actual;
  try {
    actual = crypto
      .scryptSync(normalizePassword(password), salt, KEY_LENGTH, SCRYPT_OPTIONS)
      .toString('base64url');
  } catch {
    return false;
  }

  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  if (left.length !== right.length) {
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

module.exports = {
  hashPassword,
  validatePasswordStrength,
  verifyPassword,
};
