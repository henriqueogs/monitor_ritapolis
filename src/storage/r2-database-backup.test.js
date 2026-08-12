'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const {
  backupDatabaseToR2,
  isConfigured,
  restoreDatabaseFromR2IfMissing,
} = require('./r2-database-backup');

const configured = {
  R2_ENDPOINT: 'https://example.r2.cloudflarestorage.com',
  R2_BUCKET: 'private',
  R2_ACCESS_KEY_ID: 'access',
  R2_SECRET_ACCESS_KEY: 'secret',
};

describe('R2 database backup policy', () => {
  test('requires every private R2 setting', () => {
    expect(isConfigured(configured)).toBe(true);
    expect(isConfigured({ ...configured, R2_SECRET_ACCESS_KEY: '' })).toBe(false);
  });

  test('skips backup when R2 is not configured', async () => {
    await expect(backupDatabaseToR2({ env: {}, dbPath: 'missing.db' })).resolves.toEqual({
      skipped: true,
      reason: 'r2_not_configured',
    });
  });

  test('does not overwrite an existing database', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ritapolis-r2-test-'));
    const dbPath = path.join(directory, 'ritapolis.db');
    fs.writeFileSync(dbPath, Buffer.alloc(8192));
    try {
      await expect(restoreDatabaseFromR2IfMissing({ env: configured, dbPath })).resolves.toEqual({
        skipped: true,
        reason: 'database_exists',
      });
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  test('fails closed when restore is required without credentials', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ritapolis-r2-test-'));
    try {
      await expect(restoreDatabaseFromR2IfMissing({
        env: { R2_RESTORE_REQUIRED: 'true' },
        dbPath: path.join(directory, 'ritapolis.db'),
      })).rejects.toThrow(/obrigatoria/);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  test('blocks an oversized compressed backup before uploading it', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ritapolis-r2-test-'));
    const dbPath = path.join(directory, 'ritapolis.db');
    const sqlite = new DatabaseSync(dbPath);
    try {
      sqlite.exec('CREATE TABLE dados (valor TEXT); INSERT INTO dados VALUES (randomblob(4096));');
    } finally {
      sqlite.close();
    }
    try {
      await expect(backupDatabaseToR2({
        env: { ...configured, R2_MAX_BACKUP_BYTES: '1' },
        dbPath,
      })).rejects.toThrow(/limite preventivo/);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
