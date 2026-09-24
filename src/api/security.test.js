'use strict';

const { createServer } = require('./server');
const security = require('./security');

function basic(user, password) {
  return `Basic ${Buffer.from(`${user}:${password}`, 'utf8').toString('base64')}`;
}

function withEnv(env, fn) {
  const previous = {};
  for (const key of Object.keys(env)) {
    previous[key] = process.env[key];
    if (env[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = env[key];
    }
  }
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    });
}

function listen(app) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => new Promise((done) => server.close(done)),
      });
    });
    server.once('error', reject);
  });
}

async function withServer(env, fn) {
  security.resetRateLimitForTests();
  return withEnv(env, async () => {
    const running = await listen(createServer());
    try {
      return await fn(running.baseUrl);
    } finally {
      await running.close();
    }
  });
}

describe('api security middleware', () => {
  test('keeps public health open while blocking admin reads without credentials', async () => {
    await withServer({ ADMIN_AUTH_USER: 'admin', ADMIN_AUTH_PASSWORD: 'secret', NODE_ENV: 'test' }, async (baseUrl) => {
      const health = await fetch(`${baseUrl}/api/health`);
      expect(health.status).toBe(200);
      expect(await health.json()).toEqual({ ok: true });

      const admin = await fetch(`${baseUrl}/api/admin/status`);
      expect(admin.status).toBe(401);
      expect(admin.headers.get('www-authenticate')).toContain('Basic');
      expect(admin.headers.get('cache-control')).toBe('no-store');
    });
  });

  test('blocks operational mutations without credentials before side effects run', async () => {
    await withServer({ ADMIN_AUTH_USER: 'admin', ADMIN_AUTH_PASSWORD: 'secret', NODE_ENV: 'test' }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/alertas/gerar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full: true }),
      });
      expect(response.status).toBe(401);
    });
  });

  test('allows protected routes with valid Basic credentials', async () => {
    await withServer({ ADMIN_AUTH_USER: 'admin', ADMIN_AUTH_PASSWORD: 'secret', NODE_ENV: 'test' }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/admin/status`, {
        headers: { authorization: basic('admin', 'secret') },
      });
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toHaveProperty('timestamp');
    });
  });

  test('requires an admin session when Basic credentials are missing in production', async () => {
    await withServer({ ADMIN_AUTH_USER: undefined, ADMIN_AUTH_PASSWORD: undefined, NODE_ENV: 'production' }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/admin/status`);
      expect(response.status).toBe(401);
    });
  });

  test('rejects Basic credentials in production', async () => {
    await withServer({ ADMIN_AUTH_USER: 'admin', ADMIN_AUTH_PASSWORD: 'secret', NODE_ENV: 'production' }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/admin/status`, {
        headers: { authorization: basic('admin', 'secret') },
      });
      expect(response.status).toBe(401);
      expect(response.headers.get('www-authenticate')).toBeNull();
    });
  });

  test('rejects mutating requests from non-allowlisted browser origins', async () => {
    await withServer(
      {
        ADMIN_AUTH_USER: 'admin',
        ADMIN_AUTH_PASSWORD: 'secret',
        NODE_ENV: 'production',
        ALLOWED_ORIGINS: 'https://monitor.example.com',
      },
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/admin/trigger/rebuild-fts`, {
          method: 'POST',
          headers: {
            authorization: basic('admin', 'secret'),
            origin: 'https://evil.example.com',
          },
        });
        expect(response.status).toBe(403);
      }
    );
  });
});

describe('rate limit', () => {
  function fakeReq({ path = '/api/documentos', ip = '10.0.0.1', method = 'GET' } = {}) {
    return { path, ip, method, query: {}, socket: {} };
  }

  function fakeRes() {
    return {
      statusCode: 200,
      headers: {},
      setHeader(k, v) { this.headers[k] = v; },
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
    };
  }

  function disparar(n, reqOpts) {
    let bloqueadas = 0;
    let ultimaRes;
    for (let i = 0; i < n; i++) {
      const res = fakeRes();
      let passou = false;
      security.rateLimit(fakeReq(reqOpts), res, () => { passou = true; });
      if (!passou) { bloqueadas += 1; }
      ultimaRes = res;
    }
    return { bloqueadas, ultimaRes };
  }

  beforeEach(() => {
    security.resetRateLimitForTests();
    jest.useFakeTimers({ now: new Date('2026-09-24T12:00:00Z') });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('resolverJanelaRateLimit', () => {
    it('leitura pública usa janela de 1 minuto com a cota de 15 min proporcional', () => {
      expect(security.resolverJanelaRateLimit('publicRead', {})).toEqual({ windowMs: 60000, limit: 40 });
    });

    it('respeita RATE_LIMIT_* do ambiente como cota por 15 minutos', () => {
      expect(security.resolverJanelaRateLimit('publicRead', { RATE_LIMIT_PUBLICREAD: '1500' }))
        .toEqual({ windowMs: 60000, limit: 100 });
    });

    it('auth e escrita mantêm janela de 15 minutos (anti força bruta)', () => {
      expect(security.resolverJanelaRateLimit('auth', {})).toEqual({ windowMs: 900000, limit: 20 });
      expect(security.resolverJanelaRateLimit('adminWrite', {})).toEqual({ windowMs: 900000, limit: 60 });
    });

    it('nunca retorna limite menor que 1', () => {
      expect(security.resolverJanelaRateLimit('search', { RATE_LIMIT_SEARCH: '1' }).limit).toBe(1);
    });
  });

  describe('rateLimit middleware', () => {
    it('bloqueia leitura pública acima de 40 req no mesmo minuto com Retry-After curto', () => {
      const { bloqueadas, ultimaRes } = disparar(41);
      expect(bloqueadas).toBe(1);
      expect(ultimaRes.statusCode).toBe(429);
      expect(Number(ultimaRes.headers['Retry-After'])).toBeLessThanOrEqual(60);
    });

    it('libera de novo depois de 1 minuto (não prende por 15 min)', () => {
      expect(disparar(41).bloqueadas).toBe(1);
      jest.advanceTimersByTime(60 * 1000);
      const { bloqueadas } = disparar(1);
      expect(bloqueadas).toBe(0);
    });

    it('login continua bloqueado após 1 minuto quando estourou a cota', () => {
      expect(disparar(21, { path: '/api/auth/login', method: 'POST' }).bloqueadas).toBe(1);
      jest.advanceTimersByTime(60 * 1000);
      const { bloqueadas } = disparar(1, { path: '/api/auth/login', method: 'POST' });
      expect(bloqueadas).toBe(1);
    });
  });
});
