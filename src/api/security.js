'use strict';

const { URL } = require('url');
const auth = require('../auth/admin-basic-auth');
const adminSessions = require('../auth/admin-session');
const adminAuthRepo = require('../db/admin-auth-repo');
const logger = require('../logger');
const { createRateLimiter, getRateLimitBucketSize, MAX_RATE_LIMIT_ENTRIES, resetRateLimitForTests } = require('./rate-limit');

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const DEFAULT_JSON_LIMIT = '1mb';

function splitList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function originFromUrl(value) {
  if (!value) { return null; }
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function getAllowedOrigins(env = process.env) {
  const explicit = splitList(env.ALLOWED_ORIGINS);
  const inferred = [
    originFromUrl(env.NEXT_PUBLIC_API_URL),
    originFromUrl(env.FRONTEND_URL),
    originFromUrl(env.PUBLIC_SITE_URL),
  ].filter(Boolean);

  if (env.NODE_ENV !== 'production') {
    inferred.push('http://localhost:3000', 'http://127.0.0.1:3000');
  }

  return new Set([...explicit, ...inferred]);
}

function isAllowedOrigin(origin, env = process.env) {
  if (!origin) { return true; }
  return getAllowedOrigins(env).has(origin);
}

function classifyRequest(req) {
  const path = req.path || '';
  const method = req.method || 'GET';

  if (path === '/api/health') { return 'publicRead'; }
  if (path.startsWith('/api/auth/')) { return 'auth'; }
  if (path.startsWith('/api/admin')) { return method === 'GET' ? 'adminRead' : 'adminWrite'; }
  if (path.startsWith('/api/scheduler')) { return 'adminRead'; }
  if (path.startsWith('/api/coletas')) { return method === 'GET' ? 'adminRead' : 'expensiveJob'; }
  if (path.startsWith('/api/ia/')) { return method === 'GET' ? 'adminRead' : 'expensiveJob'; }
  if (path.startsWith('/api/alertas/config')) { return method === 'GET' ? 'adminRead' : 'adminWrite'; }
  if (path === '/api/alertas/gerar') { return 'expensiveJob'; }
  if (path.startsWith('/api/inteligencia/auditoria')) { return 'adminRead'; }
  if (path.startsWith('/api/cobertura/prefeitura')) { return 'adminRead'; }
  if (path.startsWith('/api/anexos/resumos/jobs')) { return 'adminRead'; }
  if (path.startsWith('/api/busca')) { return 'search'; }
  if (req.query?.admin === '1') { return 'adminRead'; }
  if (MUTATION_METHODS.has(method)) { return 'adminWrite'; }
  return 'publicRead';
}

function requiresAdmin(req) {
  return ['adminRead', 'adminWrite', 'expensiveJob'].includes(classifyRequest(req));
}

function requireAdmin(req, res, next) {
  if (req.method === 'OPTIONS' || !requiresAdmin(req)) {
    return next();
  }

  const sessionToken = adminSessions.getSessionTokenFromRequest(req);
  const session = adminAuthRepo.getAdminSession(sessionToken);
  if (session) {
    req.adminUser = session.user;
    req.adminSession = session;
    return next();
  }

  if (process.env.NODE_ENV === 'production') {
    logger.warn('Seguranca: acesso admin sem sessao valida', {
      path: req.path,
      method: req.method,
      ip: req.ip,
    });
    return res.status(401).json({ error: 'Sessao administrativa obrigatoria' });
  }

  const state = auth.getAdminAuthState(process.env);
  if (!state.configured) {
    logger.warn('Seguranca: acesso admin sem sessao valida', {
      path: req.path,
      method: req.method,
      ip: req.ip,
    });
    return res.status(401).json({ error: 'Sessao administrativa obrigatoria' });
  }

  if (!auth.isAuthorizedBasicAuth(req.get('authorization'), process.env)) {
    logger.warn('Seguranca: acesso admin negado', {
      path: req.path,
      method: req.method,
      ip: req.ip,
    });
    return res
      .status(401)
      .set('WWW-Authenticate', 'Basic realm="Monitor Ritapolis API", charset="UTF-8"')
      .json({ error: 'Autenticacao administrativa obrigatoria' });
  }

  return next();
}

function validateOrigin(req, res, next) {
  if (!MUTATION_METHODS.has(req.method)) {
    return next();
  }

  const origin = req.get('origin');
  if (!isAllowedOrigin(origin, process.env)) {
    logger.warn('Seguranca: origem rejeitada', {
      path: req.path,
      method: req.method,
      origin,
      ip: req.ip,
    });
    return res.status(403).json({ error: 'Origem nao permitida' });
  }

  return next();
}

function applySecurityHeaders(_req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  return next();
}

function applyCachePolicy(req, res, next) {
  const classification = classifyRequest(req);
  if (classification !== 'publicRead' && classification !== 'search') {
    res.setHeader('Cache-Control', 'no-store');
  }
  return next();
}

const rateLimit = createRateLimiter(classifyRequest);

function corsOptions(req, callback) {
  const origin = req.get('origin');
  if (isAllowedOrigin(origin, process.env)) {
    return callback(null, {
      origin: origin || false,
      credentials: Boolean(origin),
      methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
      maxAge: 600,
    });
  }
  return callback(null, { origin: false });
}

function getJsonLimit(env = process.env) {
  return env.JSON_BODY_LIMIT || DEFAULT_JSON_LIMIT;
}

module.exports = {
  applyCachePolicy,
  applySecurityHeaders,
  classifyRequest,
  corsOptions,
  getAllowedOrigins,
  getJsonLimit,
  getRateLimitBucketSize,
  isAllowedOrigin,
  MAX_RATE_LIMIT_ENTRIES,
  rateLimit,
  requireAdmin,
  resetRateLimitForTests,
  validateOrigin,
};
