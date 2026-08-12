'use strict';

const { createServer } = require('./server');
const security = require('./security');
const adminAuthRepo = require('../db/admin-auth-repo');
const { db } = require('../db/connection');
const adminSession = require('../auth/admin-session');

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

function cleanup(username) {
  db.prepare(`
    DELETE FROM admin_sessions
     WHERE user_id IN (SELECT id FROM admin_users WHERE username = ?)
  `).run(username);
  db.prepare('DELETE FROM admin_users WHERE username = ?').run(username);
}

describe('admin session auth', () => {
  test('uses a __Host cookie with strict same-site policy in production', () => {
    const cookie = adminSession.buildSessionCookie('token', { NODE_ENV: 'production' });
    expect(cookie).toContain('__Host-monitor_admin_session=');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Path=/');
  });

  test('logs in and authorizes protected API routes with an HttpOnly session cookie', async () => {
    security.resetRateLimitForTests();
    const username = `__test_admin_${Date.now()}`;
    const password = 'senha-forte-123';
    cleanup(username);
    const user = adminAuthRepo.createAdminUser({ username, password });
    const running = await listen(createServer());

    try {
      const login = await fetch(`${running.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user.username, password }),
      });
      expect(login.status).toBe(200);
      const cookie = login.headers.get('set-cookie');
      expect(cookie).toContain('monitor_admin_session=');
      expect(cookie).toContain('HttpOnly');

      const admin = await fetch(`${running.baseUrl}/api/admin/status`, {
        headers: { cookie },
      });
      expect(admin.status).toBe(200);

      const logout = await fetch(`${running.baseUrl}/api/auth/logout`, {
        method: 'POST',
        headers: { cookie },
      });
      expect(logout.status).toBe(200);

      const blocked = await fetch(`${running.baseUrl}/api/admin/status`, {
        headers: { cookie },
      });
      expect(blocked.status).toBe(401);
    } finally {
      await running.close();
      cleanup(username);
    }
  });
});
