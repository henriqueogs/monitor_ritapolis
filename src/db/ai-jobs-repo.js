'use strict';

/**
 * Repositório de jobs e resumos IA.
 * Tabelas: documentos_resumos_ai, documentos_resumos_ai_jobs
 *
 * Nota: saveResumoAi permanece em index.js por enquanto porque chama
 * estruturarProdutosDeResumoAi (domínio de licitações). Será migrado
 * quando licitacoes-repo.js for criado.
 */

const crypto = require('crypto');
const { db } = require('./connection');
const { normalizeText, deepRepairStrings } = require('../utils/text');
const { classifyAiError, getAiOperationPlan } = require('../ai/operation-policy');
const config = require('../config');

// ── Utilitários privados ──────────────────────────────────────────────────────
// Cópias locais de helpers compartilhados para evitar deps circulares com index.js

function _parseJson(value) {
  if (!value) { return null; }
  try { return JSON.parse(value); } catch { return null; }
}

function _serializeJson(value) {
  return value === null ? null : JSON.stringify(value);
}

function _buildTextoHash(textoCompleto) {
  return crypto.createHash('sha256').update(String(textoCompleto || ''), 'utf8').digest('hex');
}

const _fonteLabels = { site_prefeitura: 'Prefeitura', camara: 'Câmara' };
const _tipoLabels = {
  edital: 'Licitação/Edital',
  publicacao_extrato: 'Publicação de Extrato',
  lei: 'Lei',
  portaria: 'Portaria',
  contrato: 'Contrato',
  decreto: 'Decreto',
  documento: 'Documento',
  documento_publico: 'Documento Público',
  resolucao: 'Resolução',
};
function _labelFonte(v) { return _fonteLabels[v] || v || 'Fonte nao informada'; }
function _labelTipo(v) { return _tipoLabels[v] || v || ''; }

/**
 * Lazy delegate para normalizeDocumento do index.js.
 * Evita dep circular: este módulo é importado por index.js,
 * mas normalizeDocumento é definido em index.js. O lazy require
 * garante que index.js já está completamente carregado quando
 * qualquer função deste módulo é chamada.
 */
function _normalizeDocumento(row) {
  // eslint-disable-next-line global-require
  return require('./index').normalizeDocumento(row);
}

// ── Normalizadores ────────────────────────────────────────────────────────────

function normalizeResumoAi(row) {
  if (!row) { return null; }
  return {
    ...Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        typeof value === 'string' ? normalizeText(value) : value,
      ])
    ),
    resumo_json: deepRepairStrings(_parseJson(row.resumo_json)),
  };
}

function normalizeResumoAiJob(row) {
  if (!row) { return null; }
  const startedAt = row.iniciado_em ? new Date(row.iniciado_em).getTime() : null;
  const finishedAt = row.finalizado_em ? new Date(row.finalizado_em).getTime() : null;
  const durationMs = startedAt && finishedAt ? Math.max(finishedAt - startedAt, 0) : null;
  const operation = getAiOperationPlan({
    texto: row.texto_completo || '',
    caracteres: row.texto_chars,
  });

  return {
    ...Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        typeof value === 'string' ? normalizeText(value) : value,
      ])
    ),
    texto_completo: undefined,
    duracao_ms: durationMs,
    duracao_segundos: durationMs === null ? null : Math.round(durationMs / 1000),
    erro_categoria: classifyAiError(row.erro),
    operacao: operation,
    force: Boolean(row.force),
  };
}

// ── Resumos AI ────────────────────────────────────────────────────────────────

function getResumoAiByDocumentoHash(documentoId, textoHash, contratoVersao) {
  return normalizeResumoAi(
    db
      .prepare(
        `SELECT *
         FROM documentos_resumos_ai
         WHERE documento_id = ?
           AND texto_hash = ?
           AND contrato_versao = ?
         LIMIT 1`
      )
      .get(documentoId, textoHash, contratoVersao)
  );
}

function getLatestResumoAiByDocumentoId(documentoId) {
  return normalizeResumoAi(
    db
      .prepare(
        `SELECT *
         FROM documentos_resumos_ai
         WHERE documento_id = ?
           AND status = 'ok'
           AND provider <> 'mock'
           AND contrato_versao NOT LIKE '2.%'
         ORDER BY datetime(criado_em) DESC, id DESC
         LIMIT 1`
      )
      .get(documentoId)
  );
}

function getLatestLeituraIntegradaByDocumentoId(documentoId) {
  return normalizeResumoAi(
    db
      .prepare(
        `SELECT *
         FROM documentos_resumos_ai
         WHERE documento_id = ?
           AND status = 'ok'
           AND provider <> 'mock'
           AND contrato_versao = '2.0'
         ORDER BY datetime(criado_em) DESC, id DESC
         LIMIT 1`
      )
      .get(documentoId)
  );
}

// ── Jobs de resumo AI ─────────────────────────────────────────────────────────

function createResumoAiJob({
  documento_id,
  provider,
  modelo,
  contrato_versao,
  texto_hash,
  force = false,
}) {
  const existing = db
    .prepare(
      `SELECT *
       FROM documentos_resumos_ai_jobs
       WHERE documento_id = @documento_id
         AND texto_hash = @texto_hash
         AND contrato_versao = @contrato_versao
         AND status IN ('pendente', 'processando')
       ORDER BY datetime(atualizado_em) DESC, id DESC
       LIMIT 1`
    )
    .get({ documento_id, texto_hash, contrato_versao });

  if (existing) {
    return normalizeResumoAiJob(existing);
  }

  const now = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO documentos_resumos_ai_jobs (
        documento_id, provider, modelo, contrato_versao, texto_hash,
        status, force, criado_em, atualizado_em
      ) VALUES (
        @documento_id, @provider, @modelo, @contrato_versao, @texto_hash,
        'pendente', @force, @criado_em, @atualizado_em
      )`
    )
    .run({
      documento_id,
      provider,
      modelo,
      contrato_versao,
      texto_hash,
      force: force ? 1 : 0,
      criado_em: now,
      atualizado_em: now,
    });

  return getResumoAiJobById(result.lastInsertRowid);
}

function getResumoAiJobById(id) {
  return normalizeResumoAiJob(
    db.prepare('SELECT * FROM documentos_resumos_ai_jobs WHERE id = ?').get(id)
  );
}

function getLatestResumoAiJobByDocumentoHash(documentoId, textoHash, contratoVersao) {
  return normalizeResumoAiJob(
    db
      .prepare(
        `SELECT
           j.*,
           d.texto_completo,
           LENGTH(IFNULL(d.texto_completo, '')) AS texto_chars
         FROM documentos_resumos_ai_jobs j
         JOIN documentos d ON d.id = j.documento_id
         WHERE j.documento_id = ?
           AND j.texto_hash = ?
           AND j.contrato_versao = ?
         ORDER BY datetime(j.atualizado_em) DESC, j.id DESC
         LIMIT 1`
      )
      .get(documentoId, textoHash, contratoVersao)
  );
}

function getNextPendingResumoAiJob() {
  return normalizeResumoAiJob(
    db
      .prepare(
        `SELECT *
         FROM documentos_resumos_ai_jobs
         WHERE status = 'pendente'
         ORDER BY datetime(criado_em) ASC, id ASC
         LIMIT 1`
      )
      .get()
  );
}

function listResumoAiJobs({ limite = 20, status } = {}) {
  const filters = [];
  const params = {
    limite: Math.min(Math.max(Number(limite || 20), 1), 100),
  };

  if (status) {
    filters.push('j.status = @status');
    params.status = status;
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  return db
    .prepare(
      `SELECT
         j.*,
         d.titulo,
         d.ano,
         d.tipo,
         d.fonte,
         d.texto_completo,
         r.status AS resumo_status,
         r.erro AS resumo_erro,
         length(IFNULL(d.texto_completo, '')) AS texto_chars
       FROM documentos_resumos_ai_jobs j
       JOIN documentos d ON d.id = j.documento_id
       LEFT JOIN documentos_resumos_ai r ON r.id = j.resumo_ai_id
       ${whereClause}
       ORDER BY datetime(j.atualizado_em) DESC, j.id DESC
       LIMIT @limite`
    )
    .all(params)
    .map(normalizeResumoAiJob);
}

function getResumoAiJobsStats() {
  const porStatus = db
    .prepare(
      `SELECT status, COUNT(*) AS total
       FROM documentos_resumos_ai_jobs
       GROUP BY status
       ORDER BY total DESC`
    )
    .all();
  const porErro = db
    .prepare(
      `SELECT erro, COUNT(*) AS total
       FROM documentos_resumos_ai_jobs
       WHERE status = 'erro'
       GROUP BY erro
       ORDER BY total DESC
       LIMIT 10`
    )
    .all()
    .map((item) => ({
      ...item,
      erro_categoria: classifyAiError(item.erro),
    }));

  return { por_status: porStatus, por_erro: porErro };
}

function recoverStaleResumoAiJobs({ staleMinutes = 30 } = {}) {
  const now = new Date().toISOString();
  const threshold = new Date(
    Date.now() - Number(staleMinutes || 30) * 60 * 1000
  ).toISOString();
  const result = db
    .prepare(
      `UPDATE documentos_resumos_ai_jobs
       SET status = 'pendente',
           erro = NULL,
           atualizado_em = @now
       WHERE status = 'processando'
         AND atualizado_em < @threshold`
    )
    .run({ now, threshold });

  return { recovered: result.changes, threshold, staleMinutes: Number(staleMinutes || 30) };
}

function markResumoAiJobProcessing(id) {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE documentos_resumos_ai_jobs
     SET status = 'processando',
         tentativas = tentativas + 1,
         iniciado_em = COALESCE(iniciado_em, @now),
         atualizado_em = @now
     WHERE id = @id
       AND status = 'pendente'`
  ).run({ id, now });

  return getResumoAiJobById(id);
}

function finishResumoAiJobOk(id, resumoAiId = null) {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE documentos_resumos_ai_jobs
     SET status = 'ok',
         erro = NULL,
         resumo_ai_id = @resumoAiId,
         finalizado_em = @now,
         atualizado_em = @now
     WHERE id = @id`
  ).run({ id, resumoAiId, now });

  return getResumoAiJobById(id);
}

function finishResumoAiJobError(id, erro) {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE documentos_resumos_ai_jobs
     SET status = 'erro',
         erro = @erro,
         finalizado_em = @now,
         atualizado_em = @now
     WHERE id = @id`
  ).run({ id, erro: String(erro || 'Erro desconhecido'), now });

  return getResumoAiJobById(id);
}

// ── Listagem de documentos para IA ───────────────────────────────────────────

function listDocumentosPendentesResumoAi({ limite = 20, fonte, tipo, ano } = {}) {
  const filters = ["IFNULL(texto_completo, '') <> ''"];
  const params = { limite };

  if (fonte) {
    filters.push('fonte = @fonte');
    params.fonte = fonte;
  }
  if (tipo) {
    filters.push('tipo = @tipo');
    params.tipo = tipo;
  }
  if (ano) {
    filters.push('ano = @ano');
    params.ano = Number(ano);
  }

  return db
    .prepare(
      `SELECT d.*
       FROM documentos d
       WHERE ${filters.join(' AND ')}
       ORDER BY COALESCE(d.data_publicacao, d.atualizado_em) DESC, d.id DESC
       LIMIT @limite`
    )
    .all(params)
    .map(_normalizeDocumento);
}

function listDocumentosParaResumoAi({
  limite = 20,
  fonte,
  tipo,
  ano,
  maxChars = null,
  minChars = null,
  contratoVersao = config.aiContractVersion,
} = {}) {
  const candidateLimit = Math.max(Number(limite || 20) * 20, 200);
  return listDocumentosPendentesResumoAi({ limite: candidateLimit, fonte, tipo, ano })
    .filter((documento) => {
      const textoCompleto = documento.texto_completo || '';
      if (!textoCompleto) { return false; }
      if (maxChars && textoCompleto.length > Number(maxChars)) { return false; }
      if (minChars && textoCompleto.length < Number(minChars)) { return false; }

      const textoHash = _buildTextoHash(textoCompleto);
      const resumo = getResumoAiByDocumentoHash(documento.id, textoHash, contratoVersao);
      return resumo?.status !== 'ok';
    })
    .slice(0, Math.max(Number(limite || 20), 1));
}

// ── Status e análises ─────────────────────────────────────────────────────────

function getResumoAiStatus({ fonte, tipo, ano } = {}) {
  // Filtros de escopo (fonte/tipo/ano) valem para tudo. O filtro de "tem texto"
  // vale só para o universo elegível a resumo — o acervo total ignora ele, para
  // que a UI possa mostrar quantos documentos ainda não têm texto (OCR pendente).
  const baseFilters = [];
  const params = {};
  if (fonte) { baseFilters.push('d.fonte = @fonte'); params.fonte = fonte; }
  if (tipo) { baseFilters.push('d.tipo = @tipo'); params.tipo = tipo; }
  if (ano) { baseFilters.push('d.ano = @ano'); params.ano = Number(ano); }

  const textoFilter = "IFNULL(d.texto_completo, '') <> ''";
  const filters = [textoFilter, ...baseFilters];
  const whereClause = `WHERE ${filters.join(' AND ')}`;
  const acervoWhere = baseFilters.length ? `WHERE ${baseFilters.join(' AND ')}` : '';

  // Total no acervo (ignorando o filtro de texto), por ano+tipo, para reconciliar
  // com a listagem de documentos. Chave "ano|tipo".
  const acervoPorAnoTipo = new Map(
    db
      .prepare(
        `SELECT d.ano, d.tipo, COUNT(*) AS total_acervo
         FROM documentos d
         ${acervoWhere}
         GROUP BY d.ano, d.tipo`
      )
      .all(params)
      .map((row) => [`${row.ano ?? ''}|${row.tipo ?? ''}`, row.total_acervo])
  );

  const porAnoTipo = db
    .prepare(
      `SELECT
         d.ano,
         d.tipo,
         COUNT(DISTINCT d.id) AS total_documentos,
         COUNT(DISTINCT CASE WHEN r.status = 'ok' THEN d.id END) AS com_resumo_ok,
         COUNT(DISTINCT CASE WHEN r.status = 'erro' THEN d.id END) AS com_resumo_erro
       FROM documentos d
       LEFT JOIN documentos_resumos_ai r ON r.documento_id = d.id
       ${whereClause}
       GROUP BY d.ano, d.tipo
       ORDER BY COALESCE(d.ano, 0) DESC, total_documentos DESC`
    )
    .all(params)
    .map((row) => {
      const totalAcervo = acervoPorAnoTipo.get(`${row.ano ?? ''}|${row.tipo ?? ''}`) ?? row.total_documentos;
      return {
        ...row,
        sem_resumo_ok: row.total_documentos - row.com_resumo_ok,
        total_acervo: totalAcervo,
        sem_texto: Math.max(0, totalAcervo - row.total_documentos),
      };
    });

  const porProvider = db
    .prepare(
      `SELECT
         IFNULL(r.provider, 'sem_resumo') AS provider,
         IFNULL(r.modelo, 'sem_modelo') AS modelo,
         IFNULL(r.status, 'sem_status') AS status,
         COUNT(DISTINCT d.id) AS total
       FROM documentos d
       LEFT JOIN documentos_resumos_ai r ON r.documento_id = d.id
       ${whereClause}
       GROUP BY provider, modelo, status
       ORDER BY total DESC`
    )
    .all(params);

  const totais = db
    .prepare(
      `SELECT
         COUNT(DISTINCT d.id) AS total_documentos,
         COUNT(DISTINCT CASE WHEN r.status = 'ok' THEN d.id END) AS com_resumo_ok,
         COUNT(DISTINCT CASE WHEN r.status = 'erro' THEN d.id END) AS com_resumo_erro
       FROM documentos d
       LEFT JOIN documentos_resumos_ai r ON r.documento_id = d.id
       ${whereClause}`
    )
    .get(params);

  const totalAcervo = db
    .prepare(`SELECT COUNT(*) AS total FROM documentos d ${acervoWhere}`)
    .get(params).total;

  return {
    filtros: {
      fonte: fonte || null,
      tipo: tipo || null,
      ano: ano ? Number(ano) : null,
    },
    totais: {
      ...totais,
      sem_resumo_ok: totais.total_documentos - totais.com_resumo_ok,
      total_acervo: totalAcervo,
      sem_texto: Math.max(0, totalAcervo - totais.total_documentos),
    },
    por_ano_tipo: porAnoTipo,
    por_provider: porProvider,
  };
}

function listResumoAnalises({ tipo, limite = 50 } = {}) {
  const filters = [
    "r.status = 'ok'",
    "r.provider <> 'mock'",
    "r.contrato_versao NOT LIKE '2.%'",
  ];
  const params = {
    limite: Math.min(Math.max(Number(limite || 50), 1), 100),
  };

  if (tipo) {
    filters.push('d.tipo = @tipo');
    params.tipo = tipo;
  }

  const rows = db
    .prepare(
      `SELECT
         d.id AS documento_id,
         d.titulo,
         d.tipo,
         d.ano,
         d.fonte,
         d.numero,
         d.data_publicacao,
         d.data_abertura,
         d.valor_estimado,
         r.resumo_json,
         r.criado_em AS resumo_criado_em
       FROM documentos_resumos_ai r
       JOIN documentos d ON d.id = r.documento_id
       WHERE ${filters.join(' AND ')}
         AND r.id = (
           SELECT r2.id
           FROM documentos_resumos_ai r2
           WHERE r2.documento_id = r.documento_id
             AND r2.status = 'ok'
             AND r2.provider <> 'mock'
             AND r2.contrato_versao NOT LIKE '2.%'
           ORDER BY datetime(r2.criado_em) DESC, r2.id DESC
           LIMIT 1
         )
       ORDER BY COALESCE(d.data_publicacao, d.data_abertura, '') DESC, d.id DESC
       LIMIT @limite`
    )
    .all(params);

  const itens = rows.map((row) => {
    const resumo = deepRepairStrings(_parseJson(row.resumo_json)) || {};
    return {
      documento_id: row.documento_id,
      titulo: normalizeText(row.titulo),
      tipo: row.tipo,
      tipo_nome: _labelTipo(row.tipo),
      ano: row.ano,
      fonte: row.fonte,
      fonte_nome: _labelFonte(row.fonte),
      numero: row.numero,
      data_publicacao: row.data_publicacao,
      data_abertura: row.data_abertura,
      valor_estimado: row.valor_estimado,
      resumo_criado_em: row.resumo_criado_em,
      titulo_curto: resumo.titulo_curto || null,
      resumo_cidadao: resumo.resumo_cidadao || null,
      objeto: resumo.objeto?.descricao || null,
      pontos_principais: resumo.pontos_principais || [],
      valores: resumo.valores || [],
      datas_relevantes: resumo.datas_relevantes || [],
      partes_envolvidas: resumo.partes_envolvidas || [],
      riscos_ou_alertas: resumo.riscos_ou_alertas || [],
      confianca: resumo.confianca ?? null,
    };
  });

  const porTipo = itens.reduce((acc, item) => {
    const current = acc.get(item.tipo) || {
      tipo: item.tipo,
      tipo_nome: item.tipo_nome,
      total: 0,
      com_valores: 0,
      com_riscos: 0,
    };
    current.total += 1;
    if (item.valores.length) { current.com_valores += 1; }
    if (item.riscos_ou_alertas.length) { current.com_riscos += 1; }
    acc.set(item.tipo, current);
    return acc;
  }, new Map());

  return {
    filtros: { tipo: tipo || null, limite: params.limite },
    totais: {
      documentos_analisados: itens.length,
      com_valores: itens.filter((item) => item.valores.length).length,
      com_datas: itens.filter((item) => item.datas_relevantes.length).length,
      com_riscos: itens.filter((item) => item.riscos_ou_alertas.length).length,
    },
    por_tipo: Array.from(porTipo.values()),
    itens,
  };
}

module.exports = {
  // Normalizadores (usados por outros módulos)
  normalizeResumoAi,
  normalizeResumoAiJob,
  // Resumos AI
  getResumoAiByDocumentoHash,
  getLatestResumoAiByDocumentoId,
  getLatestLeituraIntegradaByDocumentoId,
  // Jobs
  createResumoAiJob,
  getResumoAiJobById,
  getLatestResumoAiJobByDocumentoHash,
  getNextPendingResumoAiJob,
  listResumoAiJobs,
  getResumoAiJobsStats,
  recoverStaleResumoAiJobs,
  markResumoAiJobProcessing,
  finishResumoAiJobOk,
  finishResumoAiJobError,
  // Documentos para IA
  listDocumentosPendentesResumoAi,
  listDocumentosParaResumoAi,
  // Status e análises
  getResumoAiStatus,
  listResumoAnalises,
};
