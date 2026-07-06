'use strict';

const { hashPassword, validatePasswordStrength, verifyPassword } = require('./admin-password');

describe('admin password hashing', () => {
  test('hashes and verifies valid passwords', () => {
    const hash = hashPassword('senha-forte-123');
    expect(hash).toMatch(/^scrypt\$/);
    expect(verifyPassword('senha-forte-123', hash)).toBe(true);
    expect(verifyPassword('senha-errada-123', hash)).toBe(false);
  });

  test('rejects short passwords', () => {
    expect(validatePasswordStrength('curta')).toEqual({
      ok: false,
      error: 'A senha deve ter pelo menos 10 caracteres',
    });
  });
});
