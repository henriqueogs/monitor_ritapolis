'use strict';
const { hash, localTime, isRecent } = require('./policy');
const config = require('../config');

const DOCUMENT_SOURCES = [
  'site_prefeitura',
  'legislacao_prefeitura',
  'camara_legislacao',
  'camara_projetos',
];
function enqueueCollection(queue, fonte, slot) {
  const sources =
    fonte === 'todas'
      ? [...DOCUMENT_SOURCES, 'portal_transparencia', 'portal_transparencia_folha', 'pncp']
      : [fonte];
  if (
    !sources.every(s =>
      [...DOCUMENT_SOURCES, 'portal_transparencia_folha', 'portal_transparencia', 'pncp'].includes(
        s
      )
    )
  ) {
    throw new Error('Fonte de coleta nao suportada');
  }
  return sources.map(source =>
    source === 'portal_transparencia'
      ? queue.enqueue({ kind: 'financial-plan', entity: source, hash: slot, priority: 50 })
      : queue.enqueue({
          kind: 'collection',
          entity: source,
          hash: slot,
          payload: { fonte: source },
          priority: 50,
        })
  );
}
function windows(start, end) {
  const result = [];
  for (
    let time = Date.parse(`${start}T00:00:00Z`);
    time <= Date.parse(`${end}T00:00:00Z`);
    time += 7 * 86400000
  ) {
    result.push({
      ini: new Date(time).toISOString().slice(0, 10),
      fim: new Date(Math.min(time + 6 * 86400000, Date.parse(`${end}T00:00:00Z`)))
        .toISOString()
        .slice(0, 10),
    });
  }
  return result;
}
function planFinance(queue, now = new Date(), { reconciliation = false } = {}) {
  const { day } = localTime(now);
  const today = Date.parse(`${day}T00:00:00Z`);
  const year = Number(day.slice(0, 4));
  let start = new Date(today - 6 * 86400000).toISOString().slice(0, 10);
  const last = queue.meta('expenses_through');
  if (last && last < start) {
    start = new Date(Date.parse(`${last}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  }
  // Cross-year lookback is split at 31/12, so the exercise matches the source.
  for (let ano = Number(start.slice(0, 4)); ano <= year; ano++) {
    const from = ano === Number(start.slice(0, 4)) ? start : `${ano}-01-01`;
    const to = ano === year ? day : `${ano}-12-31`;
    for (const window of windows(from, to)) {
      queue.enqueue({
        kind: 'expenses',
        entity: `${ano}:${window.ini}`,
        hash: `${day}:${window.fim}`,
        payload: { ano, ...window, through: window.fim },
        priority: 55,
      });
    }
  }
  queue.enqueue({ kind: 'revenue', entity: year, hash: day, payload: { ano: year }, priority: 60 });
  if (reconciliation) {
    const years = [year, year - 1];
    if ([1, 4, 7, 10].includes(Number(day.slice(5, 7)))) {
      for (let ano = year - 2; ano >= config.transparenciaAnoInicio; ano--) {
        years.push(ano);
      }
    }
    for (const ano of years) {
      for (const window of windows(`${ano}-01-01`, ano === year ? day : `${ano}-12-31`)) {
        queue.enqueue({
          kind: 'expenses',
          entity: `${ano}:${window.ini}`,
          hash: `reconcile:${day.slice(0, 7)}:${window.fim}`,
          payload: { ano, ...window },
          priority: 200,
          historical: true,
        });
      }
    }
  }
}
function planDocument(queue, doc, now = new Date()) {
  const api = require('../db');
  const ai = require('../ai/summarize-document');
  const historical = !isRecent(doc, now);
  const priority = historical ? 150 : 10;
  const task = (kind, signature, payload = {}, offset = 0, version = '1') =>
    queue.enqueue(
      {
        kind,
        entity: doc.id,
        hash: signature,
        version,
        payload: { documentoId: doc.id, ...payload },
        priority: priority + offset,
        historical,
      },
      now
    );
  if (!doc.texto_completo?.trim()) {
    const signature = hash([doc.url_pdf, doc.url_origem, doc.hash_conteudo]);
    const limited =
      doc.url_pdf && require('./file-policy').createFilePolicy(api.db).isOversizedReview(doc.url_pdf);
    return limited
      ? task('extract', signature, { largePdf: true }, 0, '3:large-1')
      : task('extract', signature, {}, 0, '3');
  }
  const signature = ai.buildTextoHash(doc.texto_completo);
  if (!api.getResumoAiByDocumentoHash(doc.id, signature, config.aiContractVersion)) {
    return task('summary', signature, {}, 0, `${config.aiContractVersion}:resume-1`);
  }
  // Failed summaries are not treated as completed dependencies.
  if (
    api.getResumoAiByDocumentoHash(doc.id, signature, config.aiContractVersion)?.status !== 'ok'
  ) {
    return task('summary', signature, {}, 0, `${config.aiContractVersion}:resume-1`);
  }
  const anexos = require('../db/inteligencia-fatos-repo').listarAnexosDocumento(doc.id);
  for (const anexo of anexos) {
    if (
      !anexo.texto_completo &&
      !['ignorado_sem_texto_util', 'tecnico_visual'].includes(anexo.status_extracao)
    ) {
      const job = task(
        'extract-anexo',
        hash([anexo.url, anexo.datahora]),
        { anexoId: anexo.id },
        1,
        '3'
      );
      if (job.status !== 'ok' && job.status !== 'failed') {
        return job;
      }
    }
    if (anexo.texto_completo) {
      const h = ai.buildTextoHash(anexo.texto_completo);
      const version = require('../ai/summarize-anexo').getAnexoSummaryVersion(anexo.texto_completo);
      const cached = queue.db
        .prepare(
          "SELECT 1 FROM documentos_anexos_resumos_ai WHERE anexo_id = ? AND texto_hash = ? AND contrato_versao = ? AND status = 'ok' AND erro IS NULL"
        )
        .get(anexo.id, h, version);
      if (!cached) {
        const job = task('anexo-summary', h, { anexoId: anexo.id }, 2, version);
        if (job.status !== 'ok' && job.status !== 'failed') {
          return job;
        }
      }
    }
  }
  if (doc.tipo === 'edital') {
    const items = require('../ai/estruturar-itens-processo');
    const itemSources = items.listarAtasDoDocumento(doc.id);
    const itemHash = items.computeInputHash(doc, itemSources);
    const cachedItems =
      require('../db/itens-estruturacao-jobs-repo').getUltimoItensEstruturadosPorDocumento(doc.id);
    if (!items.assessItemsResult(cachedItems, doc, itemSources).valid) {
      const job = task('items', itemHash, {}, 3, items.CONTRACT_VERSION);
      return job;
    }
    const payload = api.buildLicitacaoLeituraIntegradaPayload(doc.id);
    if (api.getResumoAiByDocumentoHash(doc.id, payload.texto_hash, '2.0')?.status !== 'ok') {
      const job = task('integrated', payload.texto_hash, {}, 4, '2.0');
      if (job.status !== 'ok') {
        return job;
      }
    }
  }
  const content = hash({
    signature,
    anexos,
    resumo: api.getResumoAiByDocumentoHash(doc.id, signature, config.aiContractVersion)
      ?.resumo_json,
    produtos: doc.tipo === 'edital' ? api.getLicitacaoProdutosByDocumentoId(doc.id).dados : [],
  });
  return task('facts', content, {}, 5);
}
function planAi(queue, now = new Date()) {
  if (!config.aiSummaryEnabled || !config.aiSchedulerEnabled) {
    return;
  }
  const day = localTime(now).day;
  // Official publication outranks collection time. Missing-date 2025 rows
  // cannot jump ahead of September 2026 just because of an unchanged crawl.
  const docs = queue.db
    .prepare(
      `SELECT * FROM documentos ORDER BY
    COALESCE(data_publicacao, CASE WHEN ano >= ? THEN substr(coletado_em,1,10) END, '') DESC, id DESC`
    )
    .all(Number(day.slice(0, 4)));
  const historicalIds = new Set(
    queue.db
      .prepare(
        `SELECT DISTINCT entity FROM pipeline_jobs
    WHERE historical = 1 AND kind IN ('extract','summary','items','integrated','facts','extract-anexo','anexo-summary')
    AND created_at >= ?`
      )
      .all(`${day}T03:00:00.000Z`)
      .map(r => Number(r.entity))
  );
  for (const doc of docs) {
    const recent = isRecent(doc, now);
    if (!recent && !historicalIds.has(doc.id) && historicalIds.size >= 10) {
      continue;
    }
    const job = planDocument(queue, doc, now);
    if (
      !recent &&
      job &&
      job.status !== 'ok' &&
      (job.status !== 'failed' || job.created_at >= `${day}T03:00:00.000Z`)
    ) {
      historicalIds.add(doc.id);
    }
  }
}
function plan(queue, now = new Date()) {
  const { day, hour } = localTime(now);
  const slot = hour >= 20 ? `${day}:20` : hour >= 8 ? `${day}:08` : null;
  if (slot && config.collectionSchedulerEnabled) {
    for (const source of DOCUMENT_SOURCES) {
      enqueueCollection(queue, source, slot);
    }
  }
  if (hour >= 20 && config.dailySchedulerEnabled && queue.meta('financial_planned') !== day) {
    planFinance(queue, now, { reconciliation: day.endsWith('-01') });
    enqueueCollection(queue, 'portal_transparencia_folha', day);
    queue.setMeta('financial_planned', day);
  }
  // PNCP weekly, not in both document runs.
  if (hour >= 20 && config.dailySchedulerEnabled) {
    const week = Math.floor(Date.parse(`${day}T00:00:00Z`) / (7 * 86400000));
    queue.enqueue({
      kind: 'collection',
      entity: 'pncp',
      hash: String(week),
      payload: { fonte: 'pncp' },
      priority: 65,
    });
  }
  if (hour >= 3 || !queue.meta('backup')) {
    queue.enqueue({ kind: 'backup', entity: 'database', hash: day, priority: 0 });
  }
  // Due by elapsed time per actual URL, not by calendar month. Existing
  // completed checks seed this schedule, so migration is not another crawl.
  {
    for (const doc of queue.db
      .prepare(
        `SELECT d.id, d.url_pdf,
          (SELECT MAX(p.finished_at) FROM pipeline_jobs p
            WHERE p.entity = CAST(d.id AS TEXT) AND (
              (p.kind = 'source-check' AND p.status IN ('ok','failed')
                AND substr(p.input_hash, -length(d.url_pdf)) = d.url_pdf)
              OR (p.kind='extract' AND p.status='ok'
                AND json_extract(p.result,'$.source_url')=d.url_pdf
                AND json_extract(p.result,'$.file_hash') IS NOT NULL)
            )) AS last_checked,
          (SELECT COUNT(*) FROM pipeline_jobs p WHERE p.kind = 'source-check'
            AND p.entity = CAST(d.id AS TEXT) AND p.status IN ('pending','running')
            AND substr(p.input_hash, -length(d.url_pdf)) = d.url_pdf) AS in_flight
        FROM documentos d WHERE d.url_pdf IS NOT NULL AND d.texto_completo IS NOT NULL`
      )
      .all()) {
      if (
        doc.in_flight ||
        (doc.last_checked && now.getTime() - Date.parse(doc.last_checked) < 30 * 86400000)
      ) {
        continue;
      }
      queue.enqueue(
        {
          kind: 'source-check',
          entity: doc.id,
          hash: `${doc.last_checked || 'initial'}:${doc.url_pdf}`,
          payload: { documentoId: doc.id },
          priority: 210,
          historical: true,
        },
        now
      );
    }
  }
  planAi(queue, now);
}
module.exports = {
  plan,
  planAi,
  planDocument,
  planFinance,
  enqueueCollection,
  DOCUMENT_SOURCES,
  windows,
};
