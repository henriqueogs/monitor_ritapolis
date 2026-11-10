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
  function fakeReq({ path = '/api/documentos', ip = '10.0.0.1', method = 'GET', headers = {} } = {}) {
    const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
    return { path, ip, method, query: {}, socket: {}, get: (name) => lower[name.toLowerCase()] };
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

    it('registra um aviso por janela estourada, com a classe e sem repetir a cada 429', () => {
      const logger = require('../logger');
      const warn = jest.spyOn(logger, 'warn').mockImplementation(() => {});
      try {
        disparar(45);
        jest.advanceTimersByTime(60 * 1000);
        disparar(41);

        const avisos = warn.mock.calls.filter(([msg]) => msg.startsWith('Rate limit excedido'));
        expect(avisos).toHaveLength(2);
        expect(avisos[0][0]).toBe('Rate limit excedido (publicRead)');
        expect(avisos[0][1]).toMatchObject({ classe: 'publicRead', limite: 40 });
      } finally {
        warn.mockRestore();
      }
    });

    describe('revalidação do frontend (SSR da Vercel)', () => {
      // Monitor 10/11: varredura de robô em /credores virou rajada de revalidações saindo de
      // poucos IPs da Vercel, e a própria API devolvia 429 ao frontend.
      const TOKEN = 'x'.repeat(40);
      const comToken = (extra = {}) => ({ headers: { 'X-Frontend-Token': TOKEN }, ...extra });
      let anterior;

      beforeEach(() => {
        anterior = process.env.FRONTEND_SSR_TOKEN;
        process.env.FRONTEND_SSR_TOKEN = TOKEN;
      });

      afterEach(() => {
        if (anterior === undefined) { delete process.env.FRONTEND_SSR_TOKEN; } else { process.env.FRONTEND_SSR_TOKEN = anterior; }
      });

      it('frontend com token usa a cota própria (200/min), não a de 40/min por IP', () => {
        expect(disparar(200, comToken()).bloqueadas).toBe(0);
        expect(disparar(1, comToken()).bloqueadas).toBe(1);
      });

      it('a cota do frontend é uma só para todos os IPs da Vercel', () => {
        expect(disparar(150, comToken({ ip: '10.0.0.1' })).bloqueadas).toBe(0);
        expect(disparar(51, comToken({ ip: '10.0.0.2' })).bloqueadas).toBe(1);
      });

      it('não consome a cota pública do mesmo IP', () => {
        disparar(100, comToken());
        expect(disparar(40).bloqueadas).toBe(0);
      });

      it('token errado ou ausente cai na cota pública por IP', () => {
        expect(disparar(41, { headers: { 'X-Frontend-Token': 'y'.repeat(40) } }).bloqueadas).toBe(1);
        security.resetRateLimitForTests();
        expect(disparar(41).bloqueadas).toBe(1);
      });

      it('sem FRONTEND_SSR_TOKEN configurado (ou curto demais) ninguém ganha a cota própria', () => {
        delete process.env.FRONTEND_SSR_TOKEN;
        expect(disparar(41, comToken()).bloqueadas).toBe(1);
        security.resetRateLimitForTests();
        process.env.FRONTEND_SSR_TOKEN = 'curto';
        expect(disparar(41, { headers: { 'X-Frontend-Token': 'curto' } }).bloqueadas).toBe(1);
      });

      it('login e escrita não mudam com o token', () => {
        expect(disparar(21, comToken({ path: '/api/auth/login', method: 'POST' })).bloqueadas).toBe(1);
      });
    });

    it('login continua bloqueado após 1 minuto quando estourou a cota', () => {
      expect(disparar(21, { path: '/api/auth/login', method: 'POST' }).bloqueadas).toBe(1);
      jest.advanceTimersByTime(60 * 1000);
      const { bloqueadas } = disparar(1, { path: '/api/auth/login', method: 'POST' });
      expect(bloqueadas).toBe(1);
    });
  });
});
