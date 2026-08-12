'use strict';

const COOKIE_NAME = 'monitor_admin_session';
const PRODUCTION_COOKIE_NAME = '__Host-monitor_admin_session';
const DEFAULT_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function getSessionTtlMs(env = process.env) {
  const hours = Number(env.ADMIN_SESSION_TTL_HOURS || 12);
  if (!Number.isFinite(hours) || hours <= 0 || hours > 168) {
    return DEFAULT_SESSION_TTL_MS;
  }
  return Math.round(hours * 60 * 60 * 1000);
}

function parseCookieHeader(header) {
  const cookies = {};
  String(header || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => {
      const index = part.indexOf('=');
      if (index <= 0) { return; }
      cookies[part.slice(0, index)] = decodeURIComponent(part.slice(index + 1));
    });
  return cookies;
}

function getSessionTokenFromRequest(req) {
  const cookies = parseCookieHeader(req.get?.('cookie') || req.headers?.cookie);
  return cookies[PRODUCTION_COOKIE_NAME] || cookies[COOKIE_NAME] || null;
}

function getCookieName(env = process.env) {
  return env.NODE_ENV === 'production' ? PRODUCTION_COOKIE_NAME : COOKIE_NAME;
}

function buildSessionCookie(token, env = process.env) {
  const maxAge = Math.floor(getSessionTtlMs(env) / 1000);
  const secure = env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${getCookieName(env)}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

function buildExpiredSessionCookie(env = process.env) {
  const secure = env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${getCookieName(env)}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0${secure}`;
}

module.exports = {
  COOKIE_NAME,
  PRODUCTION_COOKIE_NAME,
  buildExpiredSessionCookie,
  buildSessionCookie,
  getSessionTtlMs,
  getSessionTokenFromRequest,
  parseCookieHeader,
};
