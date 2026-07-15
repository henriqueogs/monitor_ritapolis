'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

function criarBancoMemoria() {
  const conn = new DatabaseSync(':memory:');
  conn.exec(fs.readFileSync(path.resolve(__dirname, 'schema.sql'), 'utf8'));
  return conn;
}

const mockConn = criarBancoMemoria();
jest.mock('./connection', () => ({ db: mockConn }));

const repo = require('./admin-auth-repo');

const SENHA = 'senha-forte-123';

describe('admin-auth-repo lockout + purge', () => {
  beforeEach(() => {
    mockConn.exec('DELETE FROM admin_sessions; DELETE FROM admin_users;');
    repo.createAdminUser({ username: 'chefe', password: SENHA });
  });

  it('senha correta autentica e zera falhas', () => {
    const r = repo.verifyAdminLogin({ username: 'chefe', password: SENHA });
    expect(r.user?.username).toBe('chefe');
    expect(r.locked).toBeFalsy();
  });

  it('aceita e-mail como usuario e autentica normalizando o caso', () => {
    repo.createAdminUser({ username: 'Admin@Ritapolis.COM', password: SENHA });
    const r = repo.verifyAdminLogin({ username: 'admin@ritapolis.com', password: SENHA });
    expect(r.user?.username).toBe('admin@ritapolis.com');
  });

  it('bloqueia conta após N falhas e rejeita mesmo com senha certa durante lockout', () => {
    for (let i = 0; i < 5; i += 1) {
      repo.verifyAdminLogin({ username: 'chefe', password: 'errada' }, { maxFailed: 5, lockMs: 60000 });
    }
    const r = repo.verifyAdminLogin({ username: 'chefe', password: SENHA }, { maxFailed: 5, lockMs: 60000 });
    expect(r.locked).toBe(true);
    expect(r.user).toBeNull();
    expect(r.retryAfterSec).toBeGreaterThan(0);
  });

  it('login válido depois do lockout expirar volta a funcionar', () => {
    for (let i = 0; i < 5; i += 1) {
      repo.verifyAdminLogin({ username: 'chefe', password: 'errada' }, { maxFailed: 5, lockMs: 1 });
    }
    // lockMs=1ms já expirou
    const r = repo.verifyAdminLogin({ username: 'chefe', password: SENHA }, { maxFailed: 5, lockMs: 1 });
    expect(r.user?.username).toBe('chefe');
  });

  it('usuário inexistente não cria linha nem vaza lockout', () => {
    const r = repo.verifyAdminLogin({ username: 'fantasma', password: 'x' });
    expect(r.user).toBeNull();
    expect(r.locked).toBeFalsy();
    expect(repo.countAdminUsers()).toBe(1);
  });

  it('purgeExpiredSessions remove expiradas e revogadas, mantém válidas', () => {
    const u = repo.verifyAdminLogin({ username: 'chefe', password: SENHA }).user;
    const viva = repo.createAdminSession({ userId: u.id, ttlMs: 60000 });
    const expirada = repo.createAdminSession({ userId: u.id, ttlMs: -60000 });
    const revogada = repo.createAdminSession({ userId: u.id, ttlMs: 60000 });
    repo.revokeAdminSession(revogada.token);

    const removidas = repo.purgeExpiredSessions();

    expect(removidas).toBe(2);
    expect(repo.getAdminSession(viva.token)).not.toBeNull();
    expect(repo.getAdminSession(expirada.token)).toBeNull();
  });
});
