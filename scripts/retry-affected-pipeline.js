'use strict';
require('dotenv').config();
const { db } = require('../src/db');
const { createQueue } = require('../src/pipeline/queue');
const queue = createQueue(db);
const apply = process.argv.includes('--apply');
if (apply) {
  const guard = require('../src/storage/daily-snapshot').guardReport({
    ...process.env,
    R2_USAGE_GUARD_REQUIRED: 'true',
    R2_GUARD_REPORT_PATH:
      process.env.R2_GUARD_REPORT_PATH ||
      require('node:path').resolve(
        require('node:path').dirname(require('../src/config').dbPath),
        'r2-guard.json'
      ),
  });
  const backup = queue.meta('backup');
  const backupAge = Date.now() - Date.parse(backup?.confirmedAt || '');
  if (guard.paused || !Number.isFinite(backupAge) || backupAge > 24 * 3600000) {
    throw new Error('Seguranca: guard ou backup nao permitem reprocessamento');
  }
}
const failures = db
  .prepare(
    `SELECT * FROM pipeline_jobs p WHERE status='failed'
  AND NOT EXISTS (SELECT 1 FROM pipeline_jobs newer WHERE newer.kind=p.kind AND newer.entity=p.entity
    AND newer.id>p.id AND newer.status IN ('pending','running','ok','failed'))
  AND (
    (kind IN ('extract','extract-anexo') AND version='2' AND error LIKE 'worker_interrupted%')
    OR (kind='summary' AND version NOT LIKE '%resume-1' AND (error LIKE '%404%' OR error LIKE '%timeout%'))
    OR (kind='summary' AND version LIKE '%resume-1' AND attempts<3 AND error LIKE '%timed out%')
    OR (kind='collection' AND entity IN ('pncp','camara_legislacao','legislacao_prefeitura')
      AND (error LIKE '%url_origem%' OR error LIKE '%maxContentLength%' OR error LIKE '%timeout%'))
  ) ORDER BY id DESC`
  )
  .all();
const seen = new Set();
const changes = [];
for (const old of failures) {
  const key = `${old.kind}:${old.entity}`;
  if (seen.has(key)) {
    continue;
  }
  seen.add(key);
  if (
    old.kind === 'collection' &&
    db
      .prepare(
        `SELECT 1 FROM pipeline_jobs WHERE kind='collection'
    AND entity=? AND status IN ('pending','running')`
      )
      .get(old.entity)
  ) {
    continue;
  }
  const version =
    old.kind === 'summary'
      ? `${require('../src/config').aiContractVersion}:resume-1`
      : old.kind === 'collection'
        ? 'source-fix-1'
        : '3';
  let replacement;
  const resumeExisting = old.kind === 'summary' && old.version.endsWith('resume-1');
  if (apply) {
    if (resumeExisting) {
      // Keep the original identity: completed validated chunks belong to it.
      // This was misclassified as permanent; it still has attempts remaining.
      db.prepare(
        "UPDATE pipeline_jobs SET status='pending',error=NULL,available_at=? WHERE id=? AND status='failed' AND attempts<3"
      ).run(new Date().toISOString(), old.id);
      replacement = queue.get(old.id);
    } else {
      replacement = queue.enqueue({
        kind: old.kind,
        entity: old.entity,
        hash: old.input_hash,
        version,
        payload: JSON.parse(old.payload),
        priority: old.priority,
        historical: Boolean(old.historical),
      });
    }
  }
  changes.push({
    previousJobId: old.id,
    kind: old.kind,
    entity: old.entity,
    version,
    newJobId: replacement?.id || null,
    apply,
    resumeExisting,
  });
}
process.stdout.write(JSON.stringify({ affected: changes.length, changes }) + '\n');
db.close();
