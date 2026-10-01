'use strict';
const path = require('path');
const { fork } = require('child_process');
const { createQueue } = require('./queue');
const { plan, enqueueCollection } = require('./planner');
const { transientError, localTime } = require('./policy');
const { guardReport } = require('../storage/daily-snapshot');
const logger = require('../logger');

let queue;
let timer;
let child;
let childJob;
let planningAt = 0;
let stopping = false;
function killWorker(worker) {
  if (process.platform !== 'win32' && worker.pid > 0) {
    try {
      process.kill(-worker.pid, 'SIGKILL');
      return;
    } catch {
      /* already exited */
    }
  }
  worker.kill('SIGKILL');
}
function enabled() {
  return process.env.PIPELINE_ENABLED === 'true';
}
function getQueue() {
  if (!queue) {
    queue = createQueue(require('../db/connection').db);
  }
  return queue;
}
function safety(now = new Date()) {
  const guard = guardReport(process.env, now);
  if (guard.paused) {
    return guard;
  }
  const last = getQueue().meta('backup');
  const age = now.getTime() - Date.parse(last?.confirmedAt || '');
  return !Number.isFinite(age) || age > 24 * 3600000
    ? { paused: true, reason: 'backup_older_than_24h' }
    : { paused: false, reason: 'ok' };
}
function status() {
  return {
    enabled: enabled(),
    running: Boolean(timer),
    safety: enabled() ? safety() : null,
    ...getQueue().status(),
  };
}
function enqueueCollectionRequest(fonte = 'todas') {
  const jobs = enqueueCollection(
    getQueue(),
    fonte,
    `manual:${localTime().day}:${Math.floor(Date.now() / 3600000)}`
  );
  wake();
  return jobs;
}
function enqueueManual(kind, entity, hash, payload = {}, version = '1') {
  const job = getQueue().enqueue({ kind, entity, hash, version, payload, priority: 5 });
  if (process.env.PIPELINE_WORKER !== 'true') {
    setImmediate(wake);
  }
  return job;
}
const LEGACY = {
  summary: 'documentos_resumos_ai_jobs',
  anexo: 'documentos_anexos_resumos_ai_jobs',
  items: 'documentos_itens_estruturacao_ai_jobs',
};
function enqueueLegacy(type) {
  const table = LEGACY[type];
  if (!table) {
    throw new Error('Tipo de job invalido');
  }
  const rows = getQueue()
    .db.prepare(`SELECT id FROM ${table} WHERE status = 'pendente' ORDER BY id LIMIT 50`)
    .all();
  for (const row of rows) {
    enqueueManual(`legacy-${type}`, row.id, String(row.id), { legacyId: row.id });
  }
}
function run(job) {
  let outcome = null;
  const worker = fork(
    path.resolve(__dirname, '../../scripts/pipeline-worker.js'),
    [String(job.id)],
    {
      env: {
        ...process.env,
        PIPELINE_WORKER: 'true',
        SQLITE_CACHE_KB: '16384',
        SQLITE_MMAP_BYTES: '0',
      },
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
      windowsHide: true,
      detached: process.platform !== 'win32',
      execArgv: ['--max-old-space-size=256'],
    }
  );
  child = worker;
  childJob = job;
  const timeout = setTimeout(() => {
    outcome = { error: 'timeout: tarefa excedeu 10 minutos', transient: true };
    killWorker(worker);
  }, 10 * 60000);
  worker.on('message', message => {
    if (message?.pipelineResult) {
      outcome = message.pipelineResult;
    }
  });
  worker.once('error', error => {
    outcome = { error: error.message, transient: transientError(error.message) };
  });
  worker.once('exit', code => {
    clearTimeout(timeout);
    child = null;
    childJob = null;
    const result =
      outcome ||
      (stopping
        ? { deferred: true }
        : { error: `worker_interrupted (exit ${code})`, transient: true });
    getQueue().finish(job.id, result);
    if (!result.error && !result.deferred) {
      require('../services/cache-registry').invalidarTodos();
      if (job.kind === 'backup') {
        getQueue().setMeta('backup', result.result);
      }
      if (job.kind === 'expenses') {
        const payload = JSON.parse(job.payload);
        const last = getQueue().meta('expenses_through');
        // Windows are ordered and never leap over a failed/pending gap.
        const gap = getQueue()
          .db.prepare(
            "SELECT 1 FROM pipeline_jobs WHERE kind = 'expenses' AND priority < 100 AND status <> 'ok' AND entity < ? LIMIT 1"
          )
          .get(job.entity);
        if (payload.through && !gap && (!last || payload.through > last)) {
          getQueue().setMeta('expenses_through', payload.through);
        }
      }
      planningAt = 0;
    } else if (result.error) {
      logger.warn('Pipeline: tarefa falhou', { id: job.id, kind: job.kind, error: result.error });
    }
    if (!stopping) {
      setTimeout(wake, 10000).unref?.();
    }
  });
}
function wake() {
  if (!enabled() || child || stopping) {
    return;
  }
  try {
    const q = getQueue();
    if (Date.now() - planningAt >= 5 * 60000) {
      planningAt = Date.now();
      plan(q);
      for (const type of Object.keys(LEGACY)) {
        enqueueLegacy(type);
      }
    }
    const job = q.claim(new Date(), safety());
    if (job) {
      run(job);
    }
  } catch (error) {
    logger.error('Pipeline: coordenador falhou', { error: error.message });
  }
}
function start() {
  if (!enabled() || timer) {
    return;
  }
  stopping = false;
  timer = setInterval(wake, 60000);
  timer.unref?.();
  setTimeout(wake, 30000).unref?.();
}
function stop() {
  stopping = true;
  clearInterval(timer);
  timer = null;
  if (child) {
    killWorker(child);
    // Planned deploy shutdown is continuation, not a crash or an eleven-minute
    // stale lease. Committed checkpoints stay in the same job namespace.
    getQueue().finish(childJob.id, { deferred: true });
  }
}
module.exports = {
  enabled,
  getQueue,
  safety,
  status,
  start,
  stop,
  wake,
  enqueueCollectionRequest,
  enqueueManual,
  enqueueLegacy,
};
