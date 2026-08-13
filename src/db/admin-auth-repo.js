'use strict';

const crypto = require('crypto');
const { db } = require('./connection');
const { hashPassword, verifyPassword, validatePasswordStrength } = require('../auth/admin-password');

// Aceita usuário simples e e-mail (local@dominio): letras, números e . _ - % + @
const USERNAME_RE = /^[a-zA-Z0-9._%+@-]{3,64}$/;

function nowIso() {
  return new Date().toISOString();
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function ensureAdminAuthSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ativo',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      last_login_at TEXT,
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT
    );
    CREATE TABLE IF NOT EXISTS admin_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      user_agent TEXT,
      ip TEXT,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      last_seen_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_admin_sessions_token_hash ON admin_sessions(token_hash);
    CREATE INDEX IF NOT EXISTS idx_admin_sessions_user_id ON admin_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at ON admin_sessions(expires_at);
  `);
}

ensureAdminAuthSchema();

// Colunas de lockout em bancos criados antes desta migração.
for (const [col, def] of [['failed_attempts', 'INTEGER NOT NULL DEFAULT 0'], ['locked_until', 'TEXT']]) {
  const cols = db.prepare('PRAGMA table_info(admin_users)').all();
  if (cols.length && !cols.some((c) => c.name === col)) {
    db.exec(`ALTER TABLE admin_users ADD COLUMN ${col} ${def}`);
  }
}

// Purga oportunista de sessões mortas a cada boot — tabela de baixo volume,
// não vale um job dedicado. ponytail: boot-time purge; agendar se crescer.
purgeExpiredSessions();

function normalizeUsername(username) {
  return String(username || '').trim().toLowerCase();
}

function validateUsername(username) {
  const value = normalizeUsername(username);
  if (!USERNAME_RE.test(value)) {
    return {
      ok: false,
      error: 'Usuario deve ter 3 a 64 caracteres (letras, numeros, . _ - % + @); e-mail e aceito',
    };
  }
  return { ok: true, value };
}

function countAdminUsers() {
  return db.prepare('SELECT COUNT(*) AS total FROM admin_users').get().total;
}

function createAdminUser({ username, password, status = 'ativo' }) {
  const usernameValidation = validateUsername(username);
  if (!usernameValidation.ok) {
    const error = new Error(usernameValidation.error);
    error.code = 'INVALID_USERNAME';
    throw error;
  }

  const passwordValidation = validatePasswordStrength(password);
  if (!passwordValidation.ok) {
    const error = new Error(passwordValidation.error);
    error.code = 'INVALID_PASSWORD';
    throw error;
  }

  const info = db.prepare(`
    INSERT INTO admin_users (username, password_hash, status, updated_at)
    VALUES (?, ?, ?, ?)
  `).run(usernameValidation.value, hashPassword(password), status, nowIso());

  return getAdminUserById(Number(info.lastInsertRowid));
}

function resetAdminPassword({ username, password }) {
  const usernameValidation = validateUsername(username);
  if (!usernameValidation.ok) {
    const error = new Error(usernameValidation.error);
    error.code = 'INVALID_USERNAME';
    throw error;
  }

  const passwordValidation = validatePasswordStrength(password);
  if (!passwordValidation.ok) {
    const error = new Error(passwordValidation.error);
    error.code = 'INVALID_PASSWORD';
    throw error;
  }

  const user = db.prepare('SELECT id FROM admin_users WHERE username = ?').get(usernameValidation.value);
  if (!user) {
    const error = new Error('Usuario administrador nao encontrado');
    error.code = 'USER_NOT_FOUND';
    throw error;
  }

  const now = nowIso();
  db.prepare(`
    UPDATE admin_users
       SET password_hash = ?, failed_attempts = 0, locked_until = NULL, updated_at = ?
     WHERE id = ?
  `).run(hashPassword(password), now, user.id);
  db.prepare('UPDATE admin_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL')
    .run(now, user.id);

  return getAdminUserById(user.id);
}

function getAdminUserById(id) {
  return db.prepare(`
    SELECT id, username, status, created_at, updated_at, last_login_at
      FROM admin_users
     WHERE id = ?
  `).get(Number(id)) || null;
}

function verifyAdminLogin({ username, password }, opts = {}) {
  const maxFailed = Number(opts.maxFailed ?? process.env.ADMIN_MAX_FAILED_ATTEMPTS ?? 5);
  const lockMs = Number(opts.lockMs ?? (Number(process.env.ADMIN_LOCKOUT_MINUTES ?? 15) * 60 * 1000));
  const normalized = normalizeUsername(username);
  const user = db.prepare(`
    SELECT id, username, password_hash, status, failed_attempts, locked_until
      FROM admin_users
     WHERE username = ?
  `).get(normalized);

  // Usuário inexistente: falha genérica, sem criar linha nem vazar lockout.
  if (!user || user.status !== 'ativo') {
    return { user: null };
  }

  const now = Date.now();
  if (user.locked_until && Date.parse(user.locked_until) > now) {
    return { user: null, locked: true, retryAfterSec: Math.ceil((Date.parse(user.locked_until) - now) / 1000) };
  }

  if (!verifyPassword(password, user.password_hash)) {
    const attempts = (user.failed_attempts || 0) + 1;
    const lockedUntil = attempts >= maxFailed ? new Date(now + lockMs).toISOString() : null;
    db.prepare('UPDATE admin_users SET failed_attempts = ?, locked_until = ?, updated_at = ? WHERE id = ?')
      .run(attempts, lockedUntil, nowIso(), user.id);
    return { user: null, locked: Boolean(lockedUntil), retryAfterSec: lockedUntil ? Math.ceil(lockMs / 1000) : 0 };
  }

  db.prepare('UPDATE admin_users SET last_login_at = ?, updated_at = ?, failed_attempts = 0, locked_until = NULL WHERE id = ?')
    .run(nowIso(), nowIso(), user.id);
  return { user: getAdminUserById(user.id) };
}

function purgeExpiredSessions() {
  const info = db.prepare(
    'DELETE FROM admin_sessions WHERE expires_at < ? OR revoked_at IS NOT NULL'
  ).run(nowIso());
  return info.changes;
}

function createAdminSession({ userId, userAgent = null, ip = null, ttlMs }) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();

  db.prepare(`
    INSERT INTO admin_sessions (user_id, token_hash, user_agent, ip, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(Number(userId), tokenHash(token), userAgent, ip, expiresAt);

  return { token, expiresAt };
}

function getAdminSession(token) {
  if (!token) { return null; }
  const row = db.prepare(`
    SELECT
      s.id AS session_id,
      s.expires_at,
      u.id AS user_id,
      u.username,
      u.status
    FROM admin_sessions s
    JOIN admin_users u ON u.id = s.user_id
    WHERE s.token_hash = ?
      AND s.revoked_at IS NULL
      AND s.expires_at > ?
      AND u.status = 'ativo'
  `).get(tokenHash(token), nowIso());

  if (!row) {
    return null;
  }

  db.prepare('UPDATE admin_sessions SET last_seen_at = ? WHERE id = ?').run(nowIso(), row.session_id);
  return {
    sessionId: row.session_id,
    expiresAt: row.expires_at,
    user: {
      id: row.user_id,
      username: row.username,
      status: row.status,
    },
  };
}

function revokeAdminSession(token) {
  if (!token) { return 0; }
  const info = db.prepare(`
    UPDATE admin_sessions
       SET revoked_at = ?
     WHERE token_hash = ?
       AND revoked_at IS NULL
  `).run(nowIso(), tokenHash(token));
  return info.changes;
}

module.exports = {
  countAdminUsers,
  createAdminSession,
  createAdminUser,
  resetAdminPassword,
  ensureAdminAuthSchema,
  getAdminSession,
  getAdminUserById,
  normalizeUsername,
  purgeExpiredSessions,
  revokeAdminSession,
  validateUsername,
  verifyAdminLogin,
};
