'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { pipeline } = require('stream/promises');
const { DatabaseSync } = require('node:sqlite');
const { GetObjectCommand, PutObjectCommand, S3Client } = require('@aws-sdk/client-s3');
const config = require('../config');
const logger = require('../logger');
const { enforceR2UsageGuard } = require('./r2-usage-monitor');

const DATABASE_KEY = 'backups/latest/ritapolis.db.gz';
const MANIFEST_KEY = 'backups/latest/manifest.json';

function r2Config(env = process.env) {
  return {
    endpoint: env.R2_ENDPOINT,
    bucket: env.R2_BUCKET,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    region: env.R2_REGION || 'auto',
  };
}

function isConfigured(env = process.env) {
  return Object.values(r2Config(env)).every(Boolean);
}

function clientFor(env = process.env) {
  const settings = r2Config(env);
  if (!isConfigured(env)) { throw new Error('Credenciais do Cloudflare R2 incompletas'); }
  return {
    bucket: settings.bucket,
    client: new S3Client({
      endpoint: settings.endpoint,
      region: settings.region,
      forcePathStyle: true,
      credentials: {
        accessKeyId: settings.accessKeyId,
        secretAccessKey: settings.secretAccessKey,
      },
    }),
  };
}

function tempPaths(dbPath = config.dbPath) {
  const suffix = `${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  return {
    sqlite: path.join(path.dirname(dbPath), `.r2-backup-${suffix}.db`),
    gzip: path.join(path.dirname(dbPath), `.r2-backup-${suffix}.db.gz`),
    restore: path.join(path.dirname(dbPath), `.r2-restore-${suffix}.db`),
  };
}

function sha256File(target) {
  const hash = crypto.createHash('sha256');
  return new Promise((resolve, reject) => {
    fs.createReadStream(target)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex')));
  });
}

function removeIfExists(target) {
  if (target && fs.existsSync(target)) { fs.rmSync(target, { force: true }); }
}

async function backupDatabaseToR2({ env = process.env, dbPath = config.dbPath } = {}) {
  if (!isConfigured(env)) { return { skipped: true, reason: 'r2_not_configured' }; }
  if (!fs.existsSync(dbPath)) { throw new Error(`Banco SQLite nao encontrado: ${dbPath}`); }

  const temporary = tempPaths(dbPath);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  try {
    const sqlite = new DatabaseSync(dbPath);
    try {
      sqlite.exec('PRAGMA wal_checkpoint(PASSIVE)');
      sqlite.exec(`VACUUM INTO '${temporary.sqlite.replaceAll("'", "''")}'`);
    } finally {
      sqlite.close();
    }
    await pipeline(fs.createReadStream(temporary.sqlite), zlib.createGzip({ level: 9 }), fs.createWriteStream(temporary.gzip));

    const [{ size: originalBytes }, { size: gzipBytes }, gzipSha256] = await Promise.all([
      fs.promises.stat(temporary.sqlite),
      fs.promises.stat(temporary.gzip),
      sha256File(temporary.gzip),
    ]);
    const maxBackupBytes = Math.max(Number(env.R2_MAX_BACKUP_BYTES) || 1_000_000_000, 1);
    if (gzipBytes > maxBackupBytes) {
      throw new Error(`Backup R2 excede o limite preventivo de ${maxBackupBytes} bytes`);
    }
    await enforceR2UsageGuard({ env });
    const manifest = {
      version: 1,
      createdAt: new Date().toISOString(),
      databaseKey: DATABASE_KEY,
      gzipSha256,
      originalBytes,
      gzipBytes,
    };
    const { client, bucket } = clientFor(env);
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: DATABASE_KEY,
      Body: fs.createReadStream(temporary.gzip),
      ContentLength: gzipBytes,
      ContentType: 'application/vnd.sqlite3',
      ContentEncoding: 'gzip',
      Metadata: { sha256: gzipSha256 },
    }));
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: MANIFEST_KEY,
      Body: JSON.stringify(manifest),
      ContentType: 'application/json; charset=utf-8',
    }));
    return { skipped: false, ...manifest };
  } finally {
    removeIfExists(temporary.sqlite);
    removeIfExists(temporary.gzip);
  }
}

async function bodyToBuffer(body) {
  if (typeof body?.transformToByteArray === 'function') {
    return Buffer.from(await body.transformToByteArray());
  }
  const chunks = [];
  for await (const chunk of body) { chunks.push(Buffer.from(chunk)); }
  return Buffer.concat(chunks);
}

async function restoreDatabaseFromR2IfMissing({ env = process.env, dbPath = config.dbPath } = {}) {
  if (fs.existsSync(dbPath) && fs.statSync(dbPath).size > 4096) {
    return { skipped: true, reason: 'database_exists' };
  }
  if (!isConfigured(env)) {
    if (String(env.R2_RESTORE_REQUIRED || '').toLowerCase() === 'true') {
      throw new Error('Restauracao R2 obrigatoria, mas as credenciais estao incompletas');
    }
    return { skipped: true, reason: 'r2_not_configured' };
  }

  const temporary = tempPaths(dbPath);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  try {
    const { client, bucket } = clientFor(env);
    const manifestResponse = await client.send(new GetObjectCommand({ Bucket: bucket, Key: MANIFEST_KEY }));
    const manifest = JSON.parse((await bodyToBuffer(manifestResponse.Body)).toString('utf8'));
    const databaseResponse = await client.send(new GetObjectCommand({ Bucket: bucket, Key: manifest.databaseKey }));
    await pipeline(databaseResponse.Body, fs.createWriteStream(temporary.gzip));
    if (await sha256File(temporary.gzip) !== manifest.gzipSha256) {
      throw new Error('Checksum do backup R2 divergente');
    }
    await pipeline(fs.createReadStream(temporary.gzip), zlib.createGunzip(), fs.createWriteStream(temporary.restore));
    const restored = new DatabaseSync(temporary.restore, { readOnly: true });
    try {
      const check = restored.prepare('PRAGMA quick_check').get();
      if (check.quick_check !== 'ok') { throw new Error(`SQLite restaurado invalido: ${check.quick_check}`); }
    } finally {
      restored.close();
    }
    if (fs.existsSync(dbPath)) { fs.rmSync(dbPath, { force: true }); }
    fs.renameSync(temporary.restore, dbPath);
    return { skipped: false, createdAt: manifest.createdAt, databaseBytes: fs.statSync(dbPath).size };
  } finally {
    removeIfExists(temporary.gzip);
    removeIfExists(temporary.restore);
  }
}

function startBackupScheduler({ env = process.env } = {}) {
  if (String(env.R2_FULL_BACKUP_ENABLED || 'true').toLowerCase() === 'false') {
    logger.info('Backup completo R2 desativado: replicacao incremental habilitada');
    return null;
  }
  if (!isConfigured(env)) {
    logger.info('Backup R2 desativado: credenciais nao configuradas');
    return null;
  }
  const intervalMs = Math.max(Number(env.R2_BACKUP_INTERVAL_HOURS || 24), 1) * 60 * 60 * 1000;
  const run = () => backupDatabaseToR2({ env })
    .then((result) => logger.info('Backup SQLite enviado ao R2', result))
    .catch((error) => logger.error('Falha no backup SQLite para R2', { erro: error.message }));
  const initialTimer = setTimeout(run, Math.min(intervalMs, 5 * 60 * 1000));
  initialTimer.unref?.();
  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  return timer;
}

module.exports = {
  DATABASE_KEY,
  MANIFEST_KEY,
  backupDatabaseToR2,
  isConfigured,
  restoreDatabaseFromR2IfMissing,
  startBackupScheduler,
};
