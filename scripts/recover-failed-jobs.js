'use strict';
require('dotenv').config();
const crypto = require('node:crypto');
const path = require('node:path');
const config = require('../src/config');
const { db } = require('../src/db');
const { recoverFailedJobs } = require('../src/pipeline/recover-failed-jobs');
const flag = name => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);

function assertSafety() {
  const guard = require('../src/storage/daily-snapshot').guardReport({ ...process.env,
    R2_USAGE_GUARD_REQUIRED: 'true',
    R2_GUARD_REPORT_PATH: process.env.R2_GUARD_REPORT_PATH || path.resolve(path.dirname(config.dbPath), 'r2-guard.json'),
  });
  const backup = JSON.parse(db.prepare("SELECT value FROM pipeline_meta WHERE key='backup'").get()?.value || 'null');
  const age = Date.now() - Date.parse(backup?.confirmedAt || '');
  if (guard.paused || !Number.isFinite(age) || age < 0 || age > 24 * 3600000) {
    throw new Error('Guard do R2 ou backup nao permitem recuperacao');
  }
}

function validateInput(job) {
  if (job.kind === 'collection') { return true; }
  if (JSON.parse(job.payload).documentoId !== Number(job.entity)) { return false; }
  const doc = db.prepare('SELECT * FROM documentos WHERE id=?').get(Number(job.entity));
  if (!doc) { return false; }
  if (job.kind === 'summary') {
    const signature = crypto.createHash('sha256').update(doc.texto_completo || '').digest('hex');
    return signature === job.input_hash && job.version === `${config.aiContractVersion}:resume-1`;
  }
  const cap = config.pipelineHistoricalItemsJobCapMs ?? require('../src/pipeline/queue').ITEMS_JOB_CAP_MS;
  const spent = db.prepare('SELECT COALESCE(SUM(duration_ms),0) ms FROM pipeline_runs WHERE job_id=?').get(job.id).ms;
  if (job.historical && spent >= cap) { return 'items_job_cap_exhausted'; }
  const items = require('../src/ai/estruturar-itens-processo');
  return job.version === items.CONTRACT_VERSION &&
    job.input_hash === items.computeInputHash(doc, items.listarAtasDoDocumento(doc.id));
}

async function main() {
  const jobIds = (flag('job-ids') || '').split(',').map(Number);
  // Only a successful read from the configured public source permits PNCP recovery.
  if (jobIds.some(id => db.prepare("SELECT 1 FROM pipeline_jobs WHERE id=? AND kind='collection' AND entity='pncp'").get(id))) {
    const Collector = require('../src/coletores/pncp');
    const cnpj = require('../src/ente').ente.orgaos[0].cnpj;
    await new Collector().fetchJson(`/orgaos/${cnpj}/compras/${new Date().getFullYear()}/1`);
  }
  const report = recoverFailedJobs(db, {
    jobIds, reason: flag('reason'), apply: process.argv.includes('--apply'),
    allowExhausted: process.argv.includes('--allow-exhausted-once'),
    validateInput, assertSafety,
  });
  process.stdout.write(JSON.stringify(report) + '\n');
}

if (require.main === module) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.close());
}
module.exports = { main, validateInput, assertSafety };
