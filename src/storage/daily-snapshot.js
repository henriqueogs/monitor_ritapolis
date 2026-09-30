'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { pipeline } = require('stream/promises');
const { DatabaseSync, backup } = require('node:sqlite');
const {
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} = require('@aws-sdk/client-s3');
const { clientFor, sha256File, isConfigured } = require('./r2-database-backup');
const { stableValue, localTime } = require('../pipeline/policy');

const PREFIX = 'backups/snapshots-v1/';
const MANIFEST_KEY = `${PREFIX}manifest.json`;
const safeKey = key =>
  typeof key === 'string' && /^backups\/snapshots-v1\/[a-f0-9]{64}\.db\.gz$/.test(key);
function verifyManifest(manifest) {
  if (
    manifest?.version !== 2 ||
    !Array.isArray(manifest.entries) ||
    !manifest.entries.length ||
    manifest.entries.length > 11
  ) {
    throw new Error('Manifesto diario invalido; restauracao legada nao sera usada');
  }
  for (const entry of manifest.entries) {
    if (
      !safeKey(entry.databaseKey) ||
      !/^[a-f0-9]{64}$/.test(entry.gzipSha256) ||
      !/^[a-f0-9]{64}$/.test(entry.logicalHash) ||
      !Number.isSafeInteger(entry.gzipBytes) ||
      entry.gzipBytes <= 0 ||
      !Number.isSafeInteger(entry.originalBytes) ||
      entry.originalBytes <= 4096 ||
      !Number.isFinite(Date.parse(entry.createdAt)) ||
      !Number.isFinite(Date.parse(entry.confirmedAt))
    ) {
      throw new Error('Entrada do manifesto diario invalida');
    }
  }
  return manifest;
}
async function readManifest(client, bucket) {
  try {
    const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: MANIFEST_KEY }));
    const text = await response.Body.transformToString();
    if (text.length > 65536) {
      throw new Error('Manifesto R2 excede limite');
    }
    return verifyManifest(JSON.parse(text));
  } catch (error) {
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw error;
  }
}
function integrity(dbPath) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const checks = db.prepare('PRAGMA integrity_check').all();
    if (checks.length !== 1 || checks[0].integrity_check !== 'ok') {
      throw new Error('SQLite integrity_check falhou');
    }
  } finally {
    db.close();
  }
}
function logicalHash(db) {
  const hash = crypto.createHash('sha256');
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
    .all();
  for (const { name } of tables) {
    // Exclude ephemeral sessions, queues, logs and derived full-text indexes.
    if (/pipeline_|_jobs$|_log$|fts|admin_sessions|rate_limit/.test(name)) {
      continue;
    }
    const quote = v => `"${v.replaceAll('"', '""')}"`;
    const columns = db
      .prepare(`PRAGMA table_info(${quote(name)})`)
      .all()
      .map(c => c.name)
      .filter(c => !/^(criado_em|atualizado_em|coletado_em|ultimo_acesso|last_seen)$/.test(c));
    if (!columns.length) {
      continue;
    }
    hash.update(name);
    const stmt = db.prepare(
      `SELECT ${columns.map(quote).join(',')} FROM ${quote(name)} ORDER BY ${columns.map(quote).join(',')}`
    );
    for (const row of stmt.iterate()) {
      hash.update(JSON.stringify(stableValue(row)));
    }
  }
  return hash.digest('hex');
}
function retainEntries(entries, now = new Date()) {
  const ordered = [...entries].sort(
    (a, b) => Date.parse(b.confirmedAt) - Date.parse(a.confirmedAt)
  );
  const chosen = new Map();
  const days = new Set();
  const weeks = new Set();
  for (const e of ordered) {
    const day = localTime(new Date(e.confirmedAt)).day;
    if (!days.has(day) && days.size < 7) {
      days.add(day);
      chosen.set(e.databaseKey, e);
    }
    // Four completed week slots; a daily snapshot is also the weekly copy.
    const week = Math.floor((Date.parse(`${day}T00:00:00Z`) + 3 * 86400000) / (7 * 86400000));
    const currentWeek = Math.floor(
      (Date.parse(`${localTime(now).day}T00:00:00Z`) + 3 * 86400000) / (7 * 86400000)
    );
    if (week < currentWeek && !weeks.has(week) && weeks.size < 4) {
      weeks.add(week);
      chosen.set(e.databaseKey, e);
    }
  }
  return [...chosen.values()]
    .slice(0, 11)
    .sort((a, b) => Date.parse(b.confirmedAt) - Date.parse(a.confirmedAt));
}
function guardReport(env = process.env, now = new Date()) {
  const filename = env.R2_GUARD_REPORT_PATH;
  if (!filename) {
    if (env.R2_USAGE_GUARD_REQUIRED === 'true') {
      return { paused: true, reason: 'guard_missing' };
    }
    return { paused: false, reason: 'guard_not_required' };
  }
  try {
    const report = JSON.parse(fs.readFileSync(filename, 'utf8'));
    const age = now.getTime() - Date.parse(report.usage.checkedAt);
    if (!Number.isFinite(age) || age > 8 * 3600000 || age < -60000) {
      return { paused: true, reason: 'guard_stale' };
    }
    if (!['ok', 'warning'].includes(report.evaluation.status)) {
      return { paused: true, reason: 'guard_blocked' };
    }
    return { paused: false, reason: report.evaluation.status, report };
  } catch {
    return { paused: true, reason: 'guard_unavailable' };
  }
}
async function createDailySnapshot({
  env = process.env,
  dbPath,
  now = new Date(),
  transport,
} = {}) {
  if (!isConfigured(env) && !transport) {
    throw new Error('Backup diario requer R2 configurado');
  }
  const guard = guardReport(env, now);
  if (guard.paused) {
    throw new Error(`Backup pausado: ${guard.reason}`);
  }
  const { client, bucket } = transport || clientFor(env);
  const localDir = path.join(path.dirname(dbPath), 'snapshots-v1');
  fs.mkdirSync(localDir, { recursive: true });
  const temporary = path.join(localDir, `pending-${crypto.randomUUID()}.db`);
  const gzip = `${temporary}.gz`;
  try {
    const source = new DatabaseSync(dbPath, { readOnly: true });
    try {
      await backup(source, temporary);
    } finally {
      source.close();
    }
    integrity(temporary);
    const snapshot = new DatabaseSync(temporary, { readOnly: true });
    let signature;
    try {
      signature = logicalHash(snapshot);
    } finally {
      snapshot.close();
    }
    const previous = await readManifest(client, bucket);
    let entry = previous?.entries.find(e => e.logicalHash === signature);
    if (entry) {
      const head = await client.send(
        new HeadObjectCommand({ Bucket: bucket, Key: entry.databaseKey })
      );
      if (
        Number(head.ContentLength) !== entry.gzipBytes ||
        head.Metadata?.sha256 !== entry.gzipSha256
      ) {
        throw new Error('Copia reutilizada diverge do manifesto');
      }
      entry = { ...entry, confirmedAt: now.toISOString() };
    } else {
      await pipeline(
        fs.createReadStream(temporary),
        zlib.createGzip({ level: 6 }),
        fs.createWriteStream(gzip)
      );
      const gzipSha256 = await sha256File(gzip);
      const gzipBytes = fs.statSync(gzip).size;
      if (gzipBytes > Number(env.R2_MAX_BACKUP_BYTES || 1000000000)) {
        throw new Error('Backup excede limite preventivo');
      }
      // Reserve bytes before upload. Retention is never used to justify an
      // upload exceeding the cap; old replicas remain untouched.
      if (
        guard.report &&
        guard.report.usage.storageBytes + gzipBytes > guard.report.limits.storageBytes
      ) {
        throw new Error('Sem margem de armazenamento R2');
      }
      entry = {
        databaseKey: `${PREFIX}${gzipSha256}.db.gz`,
        gzipSha256,
        gzipBytes,
        originalBytes: fs.statSync(temporary).size,
        logicalHash: signature,
        createdAt: now.toISOString(),
        confirmedAt: now.toISOString(),
      };
      const upload = fs.createReadStream(gzip);
      upload.on('error', () => {}); // SDK failures may occur before opening the stream.
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: entry.databaseKey,
            Body: upload,
            ContentLength: gzipBytes,
            ContentType: 'application/octet-stream',
            Metadata: { sha256: gzipSha256 },
          })
        );
      } finally {
        upload.destroy();
      }
      const head = await client.send(
        new HeadObjectCommand({ Bucket: bucket, Key: entry.databaseKey })
      );
      if (Number(head.ContentLength) !== gzipBytes || head.Metadata?.sha256 !== gzipSha256) {
        throw new Error('Confirmacao do upload R2 divergente');
      }
    }
    const entries = retainEntries(
      [entry, ...(previous?.entries || []).filter(e => e.databaseKey !== entry.databaseKey)],
      now
    );
    const manifest = verifyManifest({ version: 2, confirmedAt: now.toISOString(), entries });
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: MANIFEST_KEY,
        Body: JSON.stringify(manifest),
        ContentType: 'application/json',
      })
    );
    const confirmed = await readManifest(client, bucket);
    if (
      confirmed.confirmedAt !== manifest.confirmedAt ||
      confirmed.entries[0].databaseKey !== entry.databaseKey
    ) {
      throw new Error('Manifesto nao confirmado');
    }
    const localCopy = path.join(localDir, `${entry.logicalHash}.db`);
    if (!fs.existsSync(localCopy)) {
      fs.renameSync(temporary, localCopy);
    }
    const keepLocal = new Set(entries.slice(0, 2).map(e => `${e.logicalHash}.db`));
    for (const filename of fs.readdirSync(localDir)) {
      if (/^[a-f0-9]{64}\.db$/.test(filename) && !keepLocal.has(filename)) {
        fs.unlinkSync(path.join(localDir, filename));
      }
    }
    // Only our explicit, previously committed snapshot keys can be retired.
    // No prefix enumeration, no legacy object or Litestream deletion.
    for (const old of previous?.entries || []) {
      if (!entries.some(e => e.databaseKey === old.databaseKey)) {
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: old.databaseKey }));
      }
    }
    return {
      ...entry,
      reused: Boolean(previous?.entries.some(e => e.databaseKey === entry.databaseKey)),
      copies: entries.length,
    };
  } finally {
    for (const filename of [temporary, gzip]) {
      if (fs.existsSync(filename)) {
        fs.unlinkSync(filename);
      }
    }
  }
}
async function restoreDailySnapshot({
  env = process.env,
  dbPath,
  transport,
  isolated = false,
} = {}) {
  if (fs.existsSync(dbPath)) {
    return { skipped: true, reason: 'database_exists' };
  }
  const { client, bucket } = transport || clientFor(env);
  const manifest = await readManifest(client, bucket);
  if (!manifest) {
    throw new Error('Backup diario ausente; restaure a replica legada explicitamente');
  }
  const entry = manifest.entries[0];
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const temporary = `${dbPath}.${crypto.randomUUID()}.restore`;
  const gzip = `${temporary}.gz`;
  try {
    const object = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: entry.databaseKey })
    );
    let received = 0;
    const { Transform } = require('stream');
    const limit = new Transform({
      transform(chunk, _encoding, callback) {
        received += chunk.length;
        callback(
          received > entry.gzipBytes ? new Error('Download excede tamanho do manifesto') : null,
          chunk
        );
      },
    });
    await pipeline(object.Body, limit, fs.createWriteStream(gzip, { flags: 'wx' }));
    if (received !== entry.gzipBytes || (await sha256File(gzip)) !== entry.gzipSha256) {
      throw new Error('Checksum do backup diario divergente');
    }
    let expanded = 0;
    const expansion = new Transform({
      transform(chunk, _encoding, callback) {
        expanded += chunk.length;
        callback(
          expanded > entry.originalBytes ? new Error('Backup expandido excede manifesto') : null,
          chunk
        );
      },
    });
    await pipeline(
      fs.createReadStream(gzip),
      zlib.createGunzip(),
      expansion,
      fs.createWriteStream(temporary, { flags: 'wx' })
    );
    if (expanded !== entry.originalBytes) {
      throw new Error('Tamanho SQLite divergente');
    }
    integrity(temporary);
    if (fs.existsSync(dbPath)) {
      throw new Error('Banco apareceu durante restauracao; nao sera sobrescrito');
    }
    fs.linkSync(temporary, dbPath); // Atomic create: fails if another startup created the database.
    fs.unlinkSync(temporary);
    return { ...entry, isolated, integrity: 'ok', databaseBytes: expanded };
  } finally {
    for (const filename of [temporary, gzip]) {
      if (fs.existsSync(filename)) {
        fs.unlinkSync(filename);
      }
    }
  }
}
module.exports = {
  PREFIX,
  MANIFEST_KEY,
  verifyManifest,
  retainEntries,
  logicalHash,
  guardReport,
  integrity,
  createDailySnapshot,
  restoreDailySnapshot,
};
