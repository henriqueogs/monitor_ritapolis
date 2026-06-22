'use strict';

// Repositório de alertas de inteligência. CRUD + upsert idempotente por
// chave_unica, vínculos N:N com documentos, watermark de processamento e
// configuração de thresholds/gatilhos. Sem regra de negócio — só persistência.

const { db } = require('./connection');

const STATUS_VALIDOS = new Set(['ativo', 'arquivado', 'suprimido']);
const ORDEM_SEVERIDADE = { critico: 0, atencao: 1, info: 2 };

function nowIso() {
  return new Date().toISOString();
}

function toJson(value) {
  return value === null || value === undefined ? null : JSON.stringify(value);
}

function fromJson(texto, fallback = null) {
  if (!texto) {
    return fallback;
  }
  try {
    return JSON.parse(texto);
  } catch {
    return fallback;
  }
}

function mapAlerta(row) {
  if (!row) {
    return null;
  }
  return {
    ...row,
    metadados: fromJson(row.metadados_json, {}),
    documentos_ids: fromJson(row.documentos_ids_json, []),
    questionamentos: fromJson(row.questionamentos_json, []),
  };
}

function camposDe(alerta) {
  return {
    tipo: alerta.tipo,
    categoria: alerta.categoria ?? null,
    subcategoria: alerta.subcategoria ?? null,
    severidade: alerta.severidade || 'info',
    titulo: alerta.titulo,
    narrativa: alerta.narrativa ?? null,
    metadados_json: toJson(alerta.metadados ?? null),
    periodo_inicio: alerta.periodo_inicio ?? null,
    periodo_fim: alerta.periodo_fim ?? null,
    valor_total: alerta.valor_total ?? null,
    valor_periodo_label: alerta.valor_periodo_label ?? null,
    documentos_ids_json: toJson(alerta.documentos_ids ?? null),
    questionamentos_json: toJson(alerta.questionamentos ?? null),
    confianca: alerta.confianca ?? null,
    status: alerta.status || 'ativo',
    chave_unica: alerta.chave_unica,
    ultima_publicacao_documento: alerta.ultima_publicacao_documento ?? null,
  };
}

// Upsert idempotente por chave_unica. Preserva decisão humana: se o alerta já foi
// arquivado/suprimido, a regeneração NÃO o reativa. Substitui os vínculos de
// documentos pelo conjunto fornecido.
function upsertAlerta(alerta, documentos = []) {
  const agora = nowIso();
  const campos = camposDe(alerta);
  const existing = db.prepare('SELECT id, status FROM alertas WHERE chave_unica = ?').get(campos.chave_unica);

  let id;
  if (existing) {
    const status = existing.status === 'ativo' ? campos.status : existing.status;
    // chave_unica não muda no UPDATE; node:sqlite rejeita parâmetros não usados.
    const { chave_unica: _chave, ...semChave } = campos;
    db.prepare(
      `UPDATE alertas SET
         tipo=@tipo, categoria=@categoria, subcategoria=@subcategoria, severidade=@severidade,
         titulo=@titulo, narrativa=@narrativa, metadados_json=@metadados_json,
         periodo_inicio=@periodo_inicio, periodo_fim=@periodo_fim, valor_total=@valor_total,
         valor_periodo_label=@valor_periodo_label, documentos_ids_json=@documentos_ids_json,
         questionamentos_json=@questionamentos_json, confianca=@confianca, status=@status,
         ultima_publicacao_documento=@ultima_publicacao_documento, atualizado_em=@agora
       WHERE id=@id`
    ).run({ ...semChave, status, agora, id: existing.id });
    id = existing.id;
  } else {
    const r = db
      .prepare(
        `INSERT INTO alertas (
           tipo, categoria, subcategoria, severidade, titulo, narrativa, metadados_json,
           periodo_inicio, periodo_fim, valor_total, valor_periodo_label, documentos_ids_json,
           questionamentos_json, confianca, status, chave_unica, ultima_publicacao_documento,
           criado_em, atualizado_em
         ) VALUES (
           @tipo, @categoria, @subcategoria, @severidade, @titulo, @narrativa, @metadados_json,
           @periodo_inicio, @periodo_fim, @valor_total, @valor_periodo_label, @documentos_ids_json,
           @questionamentos_json, @confianca, @status, @chave_unica, @ultima_publicacao_documento,
           @agora, @agora
         )`
      )
      .run({ ...campos, agora });
    id = r.lastInsertRowid;
  }

  db.prepare('DELETE FROM alertas_documentos WHERE alerta_id = ?').run(id);
  const ins = db.prepare(
    'INSERT OR IGNORE INTO alertas_documentos (alerta_id, documento_id, papel, trecho_fonte) VALUES (?, ?, ?, ?)'
  );
  for (const d of documentos) {
    ins.run(id, d.documento_id, d.papel || 'relacionado', d.trecho_fonte || null);
  }

  return { id, action: existing ? 'updated' : 'inserted' };
}

function listarAlertas({
  tipo,
  categoria,
  severidade,
  status = 'ativo',
  periodoInicio,
  periodoFim,
  pagina = 1,
  limite = 20,
} = {}) {
  const filtros = [];
  const params = {};
  if (status) { filtros.push('status = @status'); params.status = status; }
  if (tipo) { filtros.push('tipo = @tipo'); params.tipo = tipo; }
  if (categoria) { filtros.push('categoria = @categoria'); params.categoria = categoria; }
  if (severidade) { filtros.push('severidade = @severidade'); params.severidade = severidade; }
  if (periodoInicio) { filtros.push('ultima_publicacao_documento >= @periodoInicio'); params.periodoInicio = periodoInicio; }
  if (periodoFim) { filtros.push('ultima_publicacao_documento <= @periodoFim'); params.periodoFim = periodoFim; }

  const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS n FROM alertas ${where}`).get(params).n;
  const offset = (Math.max(1, pagina) - 1) * limite;
  const rows = db
    .prepare(
      `SELECT * FROM alertas ${where}
       ORDER BY COALESCE(ultima_publicacao_documento, '') DESC, id DESC
       LIMIT @limite OFFSET @offset`
    )
    .all({ ...params, limite, offset });
  return { total, pagina, limite, dados: rows.map(mapAlerta) };
}

// Destaques para a home: ativos, mais severos e mais recentes (por publicação).
function listarDestaques(limite = 5) {
  const rows = db
    .prepare(
      `SELECT * FROM alertas WHERE status = 'ativo'
       ORDER BY CASE severidade WHEN 'critico' THEN 0 WHEN 'atencao' THEN 1 ELSE 2 END,
                COALESCE(ultima_publicacao_documento, '') DESC, id DESC
       LIMIT ?`
    )
    .all(limite);
  return rows.map(mapAlerta);
}

function getAlerta(id) {
  const row = db.prepare('SELECT * FROM alertas WHERE id = ?').get(id);
  if (!row) {
    return null;
  }
  const documentos = db
    .prepare(
      `SELECT ad.documento_id, ad.papel, ad.trecho_fonte,
              d.titulo, d.tipo, d.ano, d.data_publicacao, d.url_origem, d.url_pdf
         FROM alertas_documentos ad
         JOIN documentos d ON d.id = ad.documento_id
        WHERE ad.alerta_id = ?
        ORDER BY COALESCE(d.data_publicacao, '') DESC`
    )
    .all(id);
  return { ...mapAlerta(row), documentos };
}

function setAlertaStatus(id, status) {
  if (!STATUS_VALIDOS.has(status)) {
    throw new Error(`status inválido: ${status}`);
  }
  const r = db.prepare('UPDATE alertas SET status = ?, atualizado_em = ? WHERE id = ?').run(status, nowIso(), id);
  return r.changes > 0;
}

function contarPorSeveridade(status = 'ativo') {
  const rows = db
    .prepare('SELECT severidade, COUNT(*) AS n FROM alertas WHERE status = ? GROUP BY severidade')
    .all(status);
  const out = { critico: 0, atencao: 0, info: 0, total: 0 };
  for (const r of rows) {
    out[r.severidade] = r.n;
    out.total += r.n;
  }
  return out;
}

// ── Watermark ───────────────────────────────────────────────────────────────
function getWatermark(chave) {
  return db.prepare('SELECT * FROM alertas_watermark WHERE chave = ?').get(chave) || null;
}

function setWatermark(chave, { ultimoProcessadoEm, totalGerados = 0 } = {}) {
  db.prepare(
    `INSERT INTO alertas_watermark (chave, ultimo_processado_em, total_gerados, atualizado_em)
       VALUES (@chave, @ts, @total, @agora)
     ON CONFLICT(chave) DO UPDATE SET
       ultimo_processado_em = @ts,
       total_gerados = alertas_watermark.total_gerados + @total,
       atualizado_em = @agora`
  ).run({ chave, ts: ultimoProcessadoEm ?? null, total: totalGerados, agora: nowIso() });
}

// ── Config ──────────────────────────────────────────────────────────────────
function getConfig(chave, fallback = null) {
  const r = db.prepare('SELECT valor_json FROM alertas_config WHERE chave = ?').get(chave);
  return r ? fromJson(r.valor_json, fallback) : fallback;
}

function getAllConfig() {
  return db
    .prepare('SELECT chave, valor_json, descricao, editavel FROM alertas_config ORDER BY chave')
    .all()
    .map((r) => ({
      chave: r.chave,
      valor: fromJson(r.valor_json),
      descricao: r.descricao,
      editavel: Boolean(r.editavel),
    }));
}

function setConfig(chave, valor, descricao = null) {
  db.prepare(
    `INSERT INTO alertas_config (chave, valor_json, descricao, atualizado_em)
       VALUES (@chave, @valor, @desc, @agora)
     ON CONFLICT(chave) DO UPDATE SET
       valor_json = @valor,
       descricao = COALESCE(@desc, alertas_config.descricao),
       atualizado_em = @agora`
  ).run({ chave, valor: toJson(valor), desc: descricao, agora: nowIso() });
}

module.exports = {
  ORDEM_SEVERIDADE,
  upsertAlerta,
  listarAlertas,
  listarDestaques,
  getAlerta,
  setAlertaStatus,
  contarPorSeveridade,
  getWatermark,
  setWatermark,
  getConfig,
  getAllConfig,
  setConfig,
};
