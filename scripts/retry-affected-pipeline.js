'use strict';
require('dotenv').config();
const { db } = require('../src/db');
const { createQueue } = require('../src/pipeline/queue');
const queue = createQueue(db);
const apply = process.argv.includes('--apply');
const retryPncpAta = process.argv.includes('--pncp-ata');
const deployStart = process.argv.find(a => a.startsWith('--deploy-from='))?.split('=').slice(1).join('=');
const deployEnd = process.argv.find(a => a.startsWith('--deploy-to='))?.split('=').slice(1).join('=');
if (deployStart || deployEnd) {
  const span = Date.parse(deployEnd) - Date.parse(deployStart);
  if (!Number.isFinite(span) || span <= 0 || span > 15 * 60000) {
    throw new Error('Janela de deploy invalida: informe inicio/fim ISO, ate 15 minutos');
  }
}
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
    `SELECT * FROM pipeline_jobs p WHERE status IN ('failed','pending')
  AND NOT EXISTS (SELECT 1 FROM pipeline_jobs newer WHERE newer.kind=p.kind AND newer.entity=p.entity
    AND newer.id>p.id AND newer.status IN ('pending','running','ok','failed'))
  AND (
    (status='failed' AND (
    (kind IN ('extract','extract-anexo') AND version='2' AND error LIKE 'worker_interrupted%')
    OR (kind='summary' AND version NOT LIKE '%resume-1' AND (error LIKE '%404%' OR error LIKE '%timeout%'))
    OR (kind='summary' AND version LIKE '%resume-1' AND attempts<3 AND error LIKE '%timed out%')
    OR (kind='collection' AND entity IN ('pncp','camara_legislacao','legislacao_prefeitura')
      AND (error LIKE '%url_origem%' OR error LIKE '%maxContentLength%' OR error LIKE '%timeout%'))
    ))
    OR (@deployStart IS NOT NULL AND attempts<3 AND finished_at BETWEEN @deployStart AND @deployEnd
      AND (error LIKE 'Cannot find module%' OR error LIKE 'worker_interrupted (exit %'))
    OR (@retryPncpAta=1 AND status='failed' AND kind='collection' AND entity='pncp' AND attempts<3
      AND error='PNCP: identificador oficial incompleto (ata)')
  ) ORDER BY id DESC`
  )
  .all({ deployStart: deployStart || null, deployEnd: deployEnd || null, retryPncpAta: retryPncpAta ? 1 : 0 });
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
    AND entity=? AND id<>? AND status IN ('pending','running')`
      )
      .get(old.entity, old.id)
  ) {
    continue;
  }
  const deployAffected = Boolean(deployStart && old.finished_at >= deployStart && old.finished_at <= deployEnd
    && /^(Cannot find module|worker_interrupted \(exit )/.test(old.error || ''));
  const pncpAtaAffected = retryPncpAta && old.kind === 'collection' && old.entity === 'pncp'
    && old.error === 'PNCP: identificador oficial incompleto (ata)';
  const version = deployAffected || pncpAtaAffected ? old.version :
    old.kind === 'summary'
      ? `${require('../src/config').aiContractVersion}:resume-1`
      : old.kind === 'collection'
        ? 'source-fix-1'
        : '3';
  let replacement;
  const resumeExisting = deployAffected || pncpAtaAffected || (old.kind === 'summary' && old.version.endsWith('resume-1'));
  if (apply) {
    if (resumeExisting) {
      // Keep the original identity: completed validated chunks belong to it.
      // Misclassified SDK timeout or a proven deploy interruption, still
      // within the same three attempts. Never duplicate its queue identity.
      db.prepare(
        "UPDATE pipeline_jobs SET status='pending',error=NULL,available_at=? WHERE id=? AND status IN ('failed','pending') AND attempts<3"
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
