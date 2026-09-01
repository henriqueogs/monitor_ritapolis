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

  test('blocks a burst of requests from one client well before the 15-minute limit', async () => {
    await withServer(
      { ADMIN_AUTH_USER: 'admin', ADMIN_AUTH_PASSWORD: 'secret', NODE_ENV: 'test', BURST_LIMIT_PUBLICREAD: '3' },
      async (baseUrl) => {
        const results = [];
        for (let i = 0; i < 5; i += 1) {
          // eslint-disable-next-line no-await-in-loop
          results.push((await fetch(`${baseUrl}/api/health`)).status);
        }
        expect(results.slice(0, 3)).toEqual([200, 200, 200]);
        expect(results.slice(3)).toEqual([429, 429]);
      }
    );
  });

  test('reports Retry-After in seconds when a burst is blocked', async () => {
    await withServer(
      { ADMIN_AUTH_USER: 'admin', ADMIN_AUTH_PASSWORD: 'secret', NODE_ENV: 'test', BURST_LIMIT_PUBLICREAD: '1' },
      async (baseUrl) => {
        await fetch(`${baseUrl}/api/health`);
        const blocked = await fetch(`${baseUrl}/api/health`);
        expect(blocked.status).toBe(429);
        expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
        expect(Number(blocked.headers.get('retry-after'))).toBeLessThanOrEqual(10);
      }
    );
  });

  test('does not let unbounded distinct clients grow the rate-limit table forever', () => {
    security.resetRateLimitForTests();
    const makeReq = (ip) => ({ path: '/api/health', method: 'GET', ip, get: () => null });
    const res = { setHeader: () => {}, status: () => res, json: () => res };
    for (let i = 0; i < 25000; i += 1) {
      security.rateLimit(makeReq(`10.0.${Math.floor(i / 255)}.${i % 255}`), res, () => {});
    }
    expect(security.getRateLimitBucketSize()).toBeLessThanOrEqual(security.MAX_RATE_LIMIT_ENTRIES);
  });
});
