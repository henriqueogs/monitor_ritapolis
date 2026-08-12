'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const DEFAULT_HANDOFF_DELAY_MS = 105_000;
const LITESTREAM_BIN = path.resolve('.render/bin/litestream');
const LITESTREAM_CONFIG = path.resolve('litestream.yml');

let activeChild = null;
let bootstrapServer = null;
let shuttingDown = false;

function handoffDelayMs(env = process.env) {
  const configured = Number(env.RENDER_HANDOFF_DELAY_MS);
  if (!Number.isFinite(configured) || configured < 90_000) {
    return DEFAULT_HANDOFF_DELAY_MS;
  }
  return Math.min(Math.trunc(configured), 10 * 60_000);
}

function wait(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function runLitestream(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(LITESTREAM_BIN, args, {
      env: process.env,
      stdio: 'inherit',
      windowsHide: true,
    });
    activeChild = child;
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      activeChild = null;
      if (signal) {
        reject(new Error(`Litestream encerrado pelo sinal ${signal}`));
      } else if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Litestream encerrou com codigo ${code}`));
      }
    });
  });
}

function startBootstrapServer(port) {
  return new Promise((resolve, reject) => {
    bootstrapServer = http.createServer((req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('X-Content-Type-Options', 'nosniff');

      if (req.url === '/api/health') {
        res.statusCode = 200;
        res.end(JSON.stringify({ ok: true, phase: 'database-handoff' }));
        return;
      }

      res.statusCode = 503;
      res.setHeader('Retry-After', '150');
      res.end(JSON.stringify({ erro: 'Publicacao em andamento; tente novamente em instantes.' }));
    });
    bootstrapServer.once('error', reject);
    bootstrapServer.listen(port, '0.0.0.0', () => resolve());
  });
}

function closeBootstrapServer() {
  return new Promise((resolve) => {
    if (!bootstrapServer) { return resolve(); }
    bootstrapServer.close(() => {
      bootstrapServer = null;
      resolve();
    });
  });
}

function shutdown(signal) {
  if (shuttingDown) { return; }
  shuttingDown = true;
  if (activeChild) {
    activeChild.kill(signal);
    return;
  }
  closeBootstrapServer().finally(() => process.exit(0));
}

async function main() {
  const dbPath = process.env.DB_PATH;
  if (!dbPath) { throw new Error('DB_PATH obrigatorio'); }
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));

  if (!fs.existsSync(dbPath)) {
    const port = Number(process.env.PORT) || 10_000;
    await startBootstrapServer(port);
    console.info(`Handoff de banco iniciado; aguardando ${handoffDelayMs()}ms antes da restauracao`);
    await wait(handoffDelayMs());

    await runLitestream([
      'restore',
      '-config', LITESTREAM_CONFIG,
      '-if-db-not-exists',
      '-if-replica-exists',
      '-integrity-check', 'quick',
      dbPath,
    ]);
    await closeBootstrapServer();
  }

  await runLitestream(['replicate', '-config', LITESTREAM_CONFIG]);
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Falha ao iniciar servico no Render:', error.message);
    process.exit(1);
  });
}

module.exports = { DEFAULT_HANDOFF_DELAY_MS, handoffDelayMs };
