'use strict';
require('dotenv').config();
const crypto = require('node:crypto');
const path = require('node:path');
const config = require('../src/config');
const { db } = require('../src/db');
const { recoverFailedJobs, listarCandidatos, retomarCategoria } = require('../src/pipeline/recover-failed-jobs');
const { createQueue } = require('../src/pipeline/queue');
const { buildTextoHash } = require('../src/ai/summarize-document');
const { getAnexoSummaryVersion, textoConfiavelParaIa } = require('../src/ai/summarize-anexo');
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

// Mesmo texto e contrato que o job viu, e o gate de OCR atual precisa aceitá-lo — senão a
// retomada só repetiria a recusa e gastaria a única retomada permitida.
function validateAnexoInput(job) {
  const { anexoId } = JSON.parse(job.payload);
  const anexo = db.prepare('SELECT * FROM documentos_anexos WHERE id=? AND documento_id=?')
    .get(anexoId, Number(job.entity));
  if (!anexo) { return false; }
  if (buildTextoHash(anexo.texto_completo) !== job.input_hash ||
    getAnexoSummaryVersion(anexo.texto_completo) !== job.version) { return false; }
  return textoConfiavelParaIa(anexo.texto_completo) ? true : 'texto_ainda_reprovado';
}

function validateInput(job) {
  if (job.kind === 'collection') { return true; }
  if (JSON.parse(job.payload).documentoId !== Number(job.entity)) { return false; }
  const doc = db.prepare('SELECT * FROM documentos WHERE id=?').get(Number(job.entity));
  if (!doc) { return false; }
  if (job.kind === 'anexo-summary') { return validateAnexoInput(job); }
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
  // --listar=contrato_rejeitado [--limite=N]: só imprime IDs candidatos, sem alterar nada.
  if (flag('listar')) {
    createQueue(db); // garante as tabelas da fila (idempotente)
    const limite = flag('limite') ? Number(flag('limite')) : undefined;
    const candidatos = listarCandidatos(db, { categoria: flag('listar'), limite });
    process.stdout.write(JSON.stringify({ candidatos, job_ids: candidatos.map(c => c.id).join(',') }) + '\n');
    return;
  }
  // --retomar=revisao_fonte --reason=... [--max=N] [--apply]: a categoria inteira em lotes de 10.
  if (flag('retomar')) {
    const relatorio = retomarCategoria(db, {
      categoria: flag('retomar'), reason: flag('reason'), apply: process.argv.includes('--apply'),
      max: flag('max') ? Number(flag('max')) : undefined, validateInput, assertSafety,
    });
    process.stdout.write(JSON.stringify(relatorio) + '\n');
    return;
  }
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
