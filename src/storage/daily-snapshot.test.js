'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Readable } = require('stream');
const { DatabaseSync } = require('node:sqlite');
const {
  createDailySnapshot,
  restoreDailySnapshot,
  retainEntries,
  logicalHash,
  MANIFEST_KEY,
  guardReport,
} = require('./daily-snapshot');
function transport() {
  const objects = new Map(),
    operations = [];
  return {
    objects,
    operations,
    bucket: 'test',
    client: {
      async send(command) {
        const { Key, Body, Metadata } = command.input;
        operations.push([command.constructor.name, Key]);
        if (command.constructor.name === 'PutObjectCommand') {
          let buffer;
          if (typeof Body === 'string') {
            buffer = Buffer.from(Body);
          } else {
            const chunks = [];
            for await (const c of Body) {
              chunks.push(c);
            }
            buffer = Buffer.concat(chunks);
          }
          objects.set(Key, { buffer, metadata: Metadata });
          return {};
        }
        if (command.constructor.name === 'DeleteObjectCommand') {
          objects.delete(Key);
          return {};
        }
        const object = objects.get(Key);
        if (!object) {
          const error = new Error('missing');
          error.name = 'NoSuchKey';
          throw error;
        }
        if (command.constructor.name === 'HeadObjectCommand') {
          return { ContentLength: object.buffer.length, Metadata: object.metadata };
        }
        const body = Readable.from([object.buffer]);
        body.transformToString = async () => object.buffer.toString();
        return { Body: body };
      },
    },
  };
}
let dir, dbPath, t;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ritapolis-daily-'));
  dbPath = path.join(dir, 'source.db');
  t = transport();
  const db = new DatabaseSync(dbPath);
  db.exec(
    "CREATE TABLE dados (id INTEGER PRIMARY KEY, valor TEXT, atualizado_em TEXT); INSERT INTO dados VALUES (1,'original','old');"
  );
  db.close();
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
test('online snapshot restores with full integrity and never overwrites a live database', async () => {
  const entry = await createDailySnapshot({ env: {}, dbPath, transport: t });
  const restored = path.join(dir, 'isolated.db');
  expect(
    (await restoreDailySnapshot({ env: {}, dbPath: restored, transport: t, isolated: true }))
      .integrity
  ).toBe('ok');
  expect((await restoreDailySnapshot({ env: {}, dbPath, transport: t })).reason).toBe(
    'database_exists'
  );
  expect(entry.databaseKey).toMatch(/^backups\/snapshots-v1\//);
});
test('unchanged data reuses the compressed object despite technical writes', async () => {
  const first = await createDailySnapshot({ env: {}, dbPath, transport: t });
  const db = new DatabaseSync(dbPath);
  db.exec(
    "UPDATE dados SET atualizado_em = 'new'; CREATE TABLE pipeline_jobs (id); INSERT INTO pipeline_jobs VALUES(1);"
  );
  db.close();
  const next = await createDailySnapshot({
    env: {},
    dbPath,
    transport: t,
    now: new Date(Date.now() + 86400000),
  });
  expect(next.reused).toBe(true);
  expect(next.databaseKey).toBe(first.databaseKey);
  expect(
    t.operations.filter(
      ([operation, key]) => operation === 'PutObjectCommand' && key !== MANIFEST_KEY
    )
  ).toHaveLength(1);
});
test('failed upload does not replace the last manifest or delete copies', async () => {
  await createDailySnapshot({ env: {}, dbPath, transport: t });
  const old = t.objects.get(MANIFEST_KEY).buffer.toString();
  const db = new DatabaseSync(dbPath);
  db.exec("UPDATE dados SET valor='changed'");
  db.close();
  const send = t.client.send;
  t.client.send = command =>
    command.constructor.name === 'PutObjectCommand' && command.input.Key !== MANIFEST_KEY
      ? Promise.reject(new Error('ECONNRESET'))
      : send(command);
  await expect(createDailySnapshot({ env: {}, dbPath, transport: t })).rejects.toThrow(
    'ECONNRESET'
  );
  expect(t.objects.get(MANIFEST_KEY).buffer.toString()).toBe(old);
  expect(t.operations.filter(([operation]) => operation === 'DeleteObjectCommand')).toHaveLength(0);
});
test('checksum failure leaves no restored database and no fallback to legacy backup', async () => {
  const entry = await createDailySnapshot({ env: {}, dbPath, transport: t });
  t.objects.get(entry.databaseKey).buffer[0] ^= 1;
  const target = path.join(dir, 'restore.db');
  await expect(restoreDailySnapshot({ env: {}, dbPath: target, transport: t })).rejects.toThrow(
    /Checksum/
  );
  expect(fs.existsSync(target)).toBe(false);
});
test('retention combines 7 daily and 4 weekly slots without duplicate objects', () => {
  const now = new Date('2026-09-30T06:00:00Z');
  const entries = Array.from({ length: 60 }, (_, n) => ({
    databaseKey: String(n),
    confirmedAt: new Date(now.getTime() - n * 86400000).toISOString(),
  }));
  const retained = retainEntries(entries, now);
  expect(retained.length).toBeLessThanOrEqual(11);
  expect(new Set(retained.map(e => e.databaseKey)).size).toBe(retained.length);
  expect(retained[0].databaseKey).toBe('0');
});
test('guard fails closed for stale or missing reports but does not stop API', () => {
  expect(guardReport({ R2_USAGE_GUARD_REQUIRED: 'true' }).paused).toBe(true);
  const filename = path.join(dir, 'guard.json');
  fs.writeFileSync(
    filename,
    JSON.stringify({
      usage: { checkedAt: '2026-09-29T00:00:00Z' },
      evaluation: { status: 'warning' },
    })
  );
  expect(
    guardReport({ R2_GUARD_REPORT_PATH: filename }, new Date('2026-09-30T00:00:00Z')).reason
  ).toBe('guard_stale');
});
test('material changes produce different logical signature', () => {
  const db = new DatabaseSync(dbPath);
  const first = logicalHash(db);
  db.exec("UPDATE dados SET valor='changed'");
  expect(logicalHash(db)).not.toBe(first);
  db.close();
});
