'use strict';

// Repositório de alertas de inteligência. CRUD + upsert idempotente por
// chave_unica, vínculos N:N com documentos, watermark de processamento e
// configuração de thresholds/gatilhos. Sem regra de negócio — só persistência.

const crypto = require('crypto');
const { db } = require('./connection');

const STATUS_VALIDOS = new Set(['ativo', 'arquivado', 'suprimido']);
const ESTADOS_EDITORIAIS = new Set([
  'candidato',
  'evidencias_prontas',
  'analisado',
  'revisao',
  'publicado',
  'rejeitado',
]);
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

function buildHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
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
    qualidade_motivos: fromJson(row.qualidade_motivos_json, []),
  };
}

function pickDefined(source, keys) {
  const out = {};
  for (const key of keys) {
    if (source && source[key] !== undefined && source[key] !== null) {
      out[key] = source[key];
    }
  }
  return out;
}

function discoveryPublico(discovery) {
  if (!discovery || typeof discovery !== 'object') {
    return null;
  }
  return pickDefined(discovery, [
    'tipo_investigacao',
    'subject_key',
    'hipotese_publica',
    'pergunta_cidada',
    'resposta_direta',
    'por_que_olhar',
    'narrativa_consolidada',
    'o_que_os_dados_mostram',
    'lacunas_encontradas',
    'perguntas_abertas',
    'metricas',
    'comparativos',
  ]);
}

function metadadosPublicos(metadados) {
  if (!metadados || typeof metadados !== 'object') {
    return {};
  }
  const out = pickDefined(metadados, ['unidade', 'ano', 'investigacao_tipo']);
  const discovery = discoveryPublico(metadados.discovery_v3);
  if (discovery && Object.keys(discovery).length) {
    out.discovery_v3 = discovery;
  }
  return out;
}

function evidenciaPublica(evidencia) {
  if (!evidencia) {
    return evidencia;
  }
  const metadados = pickDefined(evidencia.metadados, [
    'empenho_id',
    'empenho',
    'exercicio',
    'credor_nome',
    'valor',
    'portal_url',
  ]);

  return {
    id: evidencia.id,
    documento_id: evidencia.documento_id,
    anexo_id: evidencia.anexo_id,
    papel: evidencia.papel,
    trecho_fonte: metadados.empenho_id ? evidencia.trecho_fonte : undefined,
    documento_titulo: evidencia.documento_titulo,
    documento_tipo: evidencia.documento_tipo,
    documento_ano: evidencia.documento_ano,
    documento_data_publicacao: evidencia.documento_data_publicacao,
    anexo_nome: evidencia.anexo_nome,
    anexo_tipo: evidencia.anexo_tipo,
    anexo_url: evidencia.anexo_url,
    fato_descricao: evidencia.fato_descricao,
    fato_quantidade: evidencia.fato_quantidade,
    fato_unidade: evidencia.fato_unidade,
    fato_valor: evidencia.fato_valor,
    metadados,
  };
}

function alertaPublico(alerta) {
  if (!alerta || alerta.status !== 'ativo' || alerta.estado_editorial !== 'publicado') {
    return null;
  }
  const documentos = Array.isArray(alerta.documentos)
    ? alerta.documentos.map(({ trecho_fonte: _trecho, ...documento }) => documento)
    : undefined;
  const evidencias = Array.isArray(alerta.evidencias)
    ? alerta.evidencias.map(evidenciaPublica)
    : undefined;

  return {
    id: alerta.id,
    tipo: alerta.tipo,
    categoria: alerta.categoria,
    subcategoria: alerta.subcategoria,
    severidade: alerta.severidade,
    titulo: alerta.titulo,
    narrativa: alerta.narrativa,
    metadados: metadadosPublicos(alerta.metadados),
    periodo_inicio: alerta.periodo_inicio,
    periodo_fim: alerta.periodo_fim,
    valor_total: alerta.valor_total,
    valor_periodo_label: alerta.valor_periodo_label,
    documentos_ids: alerta.documentos_ids,
    questionamentos: alerta.questionamentos,
    ultima_publicacao_documento: alerta.ultima_publicacao_documento,
    publicado_em: alerta.publicado_em,
    ...(documentos ? { documentos } : {}),
    ...(evidencias ? { evidencias } : {}),
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
    estado_editorial: alerta.estado_editorial || 'candidato',
    evidencias_hash: alerta.evidencias_hash ?? null,
    qualidade_motivos_json: toJson(alerta.qualidade_motivos || []),
    qualidade_versao: alerta.qualidade_versao ?? null,
    publicado_em: alerta.publicado_em ?? null,
    chave_unica: alerta.chave_unica,
    ultima_publicacao_documento: alerta.ultima_publicacao_documento ?? null,
  };
}

// Hash de identidade das evidências — decide quando um alerta reabre (reprocessa).
// Usa só a identidade ESTÁVEL e independente do caminho (documento/anexo/fato):
// `fato_id` vem de upsert idempotente por origem_hash, então muda apenas quando o
// fato muda de conteúdo. Incluir `trecho_fonte`/`metadados` reabria itens a cada
// re-extração porque esses campos divergem entre o candidato (gerador) e a
// evidência já persistida (investigada) para o MESMO fato — churn que
// des-publicava descobertas boas todo ciclo.
function buildEvidenciasHash(evidencias = []) {
  const normalizadas = evidencias
    .map((e) => ({
      documento_id: Number(e.documento_id) || null,
      anexo_id: Number(e.anexo_id) || null,
      fato_id: Number(e.fato_id) || null,
    }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return normalizadas.length ? buildHash(normalizadas) : null;
}

function registrarHistorico({ alertaId, anterior = null, novo, origem = 'sistema', motivos = [], evidenciasHash = null }) {
  db.prepare(
    `INSERT INTO alertas_editorial_historico (
       alerta_id, estado_anterior, estado_novo, origem, motivos_json, evidencias_hash, criado_em
     ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(alertaId, anterior, novo, origem, toJson(motivos || []), evidenciasHash, nowIso());
}

// Upsert idempotente por chave_unica. Preserva decisão humana: se o alerta já foi
// arquivado/suprimido, a regeneração NÃO o reativa. Substitui os vínculos de
// documentos pelo conjunto fornecido.
function upsertAlerta(alerta, documentos = [], evidencias = []) {
  const agora = nowIso();
  const estadoInformado = Object.prototype.hasOwnProperty.call(alerta, 'estado_editorial');
  const evidenciasHash = alerta.evidencias_hash || buildEvidenciasHash(evidencias);
  const campos = camposDe({ ...alerta, evidencias_hash: evidenciasHash });
  const existing = db
    .prepare(
      `SELECT id, status, estado_editorial, evidencias_hash, metadados_json,
              titulo, narrativa, qualidade_motivos_json, qualidade_versao, publicado_em
         FROM alertas WHERE chave_unica = ?`
    )
    .get(campos.chave_unica);

  let id;
  if (existing) {
    const status = existing.status === 'ativo' ? campos.status : existing.status;
    const mesmoHash = Boolean(evidenciasHash && existing.evidencias_hash === evidenciasHash);
    const origemGerador = ['gerador_factual', 'migracao_legado'].includes(alerta.estado_editorial_origem);
    const estadoTerminal = ['publicado', 'revisao', 'rejeitado'].includes(existing.estado_editorial);
    const preservarEstadoTerminal = mesmoHash && origemGerador && estadoTerminal;
    const estadoEditorial = preservarEstadoTerminal
      ? existing.estado_editorial
      : estadoInformado
      ? campos.estado_editorial
      : mesmoHash
        ? existing.estado_editorial
        : 'candidato';
    const publicadoEm = estadoEditorial === 'publicado'
      ? campos.publicado_em || existing.publicado_em || agora
      : null;
    const preservarConteudoPublicado = mesmoHash && existing.estado_editorial === 'publicado'
      && (!estadoInformado || preservarEstadoTerminal);
    // chave_unica não muda no UPDATE; node:sqlite rejeita parâmetros não usados.
    const { chave_unica: _chave, ...semChave } = campos;
    db.prepare(
      `UPDATE alertas SET
         tipo=@tipo, categoria=@categoria, subcategoria=@subcategoria, severidade=@severidade,
         titulo=@titulo, narrativa=@narrativa, metadados_json=@metadados_json,
         periodo_inicio=@periodo_inicio, periodo_fim=@periodo_fim, valor_total=@valor_total,
         valor_periodo_label=@valor_periodo_label, documentos_ids_json=@documentos_ids_json,
         questionamentos_json=@questionamentos_json, confianca=@confianca, status=@status,
         estado_editorial=@estado_editorial, evidencias_hash=@evidencias_hash,
         qualidade_motivos_json=@qualidade_motivos_json, qualidade_versao=@qualidade_versao,
         publicado_em=@publicado_em,
         ultima_publicacao_documento=@ultima_publicacao_documento, atualizado_em=@agora
       WHERE id=@id`
    ).run({
      ...semChave,
      status,
      estado_editorial: estadoEditorial,
      titulo: preservarConteudoPublicado ? existing.titulo : semChave.titulo,
      narrativa: preservarConteudoPublicado ? existing.narrativa : semChave.narrativa,
      metadados_json: preservarConteudoPublicado ? existing.metadados_json : semChave.metadados_json,
      qualidade_motivos_json: preservarConteudoPublicado
        ? existing.qualidade_motivos_json
        : semChave.qualidade_motivos_json,
      qualidade_versao: preservarConteudoPublicado ? existing.qualidade_versao : semChave.qualidade_versao,
      publicado_em: publicadoEm,
      agora,
      id: existing.id,
    });
    id = existing.id;
    if (existing.estado_editorial !== estadoEditorial) {
      registrarHistorico({
        alertaId: id,
        anterior: existing.estado_editorial,
        novo: estadoEditorial,
        origem: alerta.estado_editorial_origem || 'upsert',
        motivos: alerta.qualidade_motivos || [],
        evidenciasHash,
      });
    }
  } else {
    const publicadoEm = campos.estado_editorial === 'publicado' ? campos.publicado_em || agora : null;
    const r = db
      .prepare(
        `INSERT INTO alertas (
           tipo, categoria, subcategoria, severidade, titulo, narrativa, metadados_json,
           periodo_inicio, periodo_fim, valor_total, valor_periodo_label, documentos_ids_json,
           questionamentos_json, confianca, status, estado_editorial, evidencias_hash,
           qualidade_motivos_json, qualidade_versao, publicado_em,
           chave_unica, ultima_publicacao_documento,
           criado_em, atualizado_em
         ) VALUES (
           @tipo, @categoria, @subcategoria, @severidade, @titulo, @narrativa, @metadados_json,
           @periodo_inicio, @periodo_fim, @valor_total, @valor_periodo_label, @documentos_ids_json,
           @questionamentos_json, @confianca, @status, @estado_editorial, @evidencias_hash,
           @qualidade_motivos_json, @qualidade_versao, @publicado_em,
           @chave_unica, @ultima_publicacao_documento,
           @agora, @agora
         )`
      )
      .run({ ...campos, publicado_em: publicadoEm, agora });
    id = r.lastInsertRowid;
    registrarHistorico({
      alertaId: id,
      novo: campos.estado_editorial,
      origem: alerta.estado_editorial_origem || 'insert',
      motivos: alerta.qualidade_motivos || [],
      evidenciasHash,
    });
  }

  db.prepare('DELETE FROM alertas_documentos WHERE alerta_id = ?').run(id);
  db.prepare('DELETE FROM alertas_evidencias WHERE alerta_id = ?').run(id);
  const ins = db.prepare(
    'INSERT OR IGNORE INTO alertas_documentos (alerta_id, documento_id, papel, trecho_fonte) VALUES (?, ?, ?, ?)'
  );
  for (const d of documentos) {
    ins.run(id, d.documento_id, d.papel || 'relacionado', d.trecho_fonte || null);
  }
  const insEv = db.prepare(
    `INSERT OR IGNORE INTO alertas_evidencias (
       alerta_id, documento_id, anexo_id, fato_id, papel, trecho_fonte, metadados_json, evidencia_hash
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const e of evidencias) {
    const hash = e.evidencia_hash || buildHash({
      documento_id: e.documento_id || null,
      anexo_id: e.anexo_id || null,
      fato_id: e.fato_id || null,
      papel: e.papel || 'evidencia',
      trecho_fonte: e.trecho_fonte || null,
    });
    insEv.run(
      id,
      e.documento_id || null,
      e.anexo_id || null,
      e.fato_id || null,
      e.papel || 'evidencia',
      e.trecho_fonte || null,
      toJson(e.metadados || null),
      hash
    );
  }

  return { id, action: existing ? 'updated' : 'inserted' };
}

// Reconciliação de rebuild completo: retira da publicação, sem apagar dados,
// descobertas ATIVAS cuja chave não está mais entre as geradas.
function removerAtivosNaoListados(chaves = []) {
  if (!chaves.length) {
    return 0;
  }
  const placeholders = chaves.map(() => '?').join(',');
  const alvos = db
    .prepare(`SELECT id FROM alertas WHERE status = 'ativo' AND chave_unica NOT IN (${placeholders})`)
    .all(...chaves);
  if (!alvos.length) {
    return 0;
  }
  const agora = nowIso();
  const update = db.prepare(
    `UPDATE alertas
        SET estado_editorial = 'rejeitado',
            qualidade_motivos_json = @motivos,
            qualidade_versao = 'discovery-quality-v3',
            publicado_em = NULL,
            atualizado_em = @agora
      WHERE id = @id`
  );
  for (const alvo of alvos) {
    const anterior = db.prepare('SELECT estado_editorial, evidencias_hash FROM alertas WHERE id = ?').get(alvo.id);
    update.run({ id: alvo.id, motivos: toJson(['SUPERSEDED_BY_REBUILD']), agora });
    registrarHistorico({
      alertaId: alvo.id,
      anterior: anterior?.estado_editorial || null,
      novo: 'rejeitado',
      origem: 'rebuild',
      motivos: ['SUPERSEDED_BY_REBUILD'],
      evidenciasHash: anterior?.evidencias_hash || null,
    });
  }
  return alvos.length;
}

function listarAlertas({
  tipo,
  categoria,
  severidade,
  status = 'ativo',
  estadoEditorial,
  periodoInicio,
  periodoFim,
  pagina = 1,
  limite = 20,
} = {}) {
  const filtros = [];
  const params = {};
  if (status) { filtros.push('status = @status'); params.status = status; }
  if (estadoEditorial) { filtros.push('estado_editorial = @estadoEditorial'); params.estadoEditorial = estadoEditorial; }
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
function listarAlertasPublicos(params = {}) {
  const resultado = listarAlertas({ ...params, status: 'ativo', estadoEditorial: 'publicado' });
  return {
    ...resultado,
    dados: resultado.dados.map(alertaPublico).filter(Boolean),
  };
}

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

function listarDestaquesPublicos(limite = 5) {
  const rows = db
    .prepare(
      `SELECT * FROM alertas
        WHERE status = 'ativo' AND estado_editorial = 'publicado'
        ORDER BY CASE severidade WHEN 'critico' THEN 0 WHEN 'atencao' THEN 1 ELSE 2 END,
                 COALESCE(ultima_publicacao_documento, '') DESC,
                 COALESCE(publicado_em, '') DESC,
                 id DESC
        LIMIT ?`
    )
    .all(limite);
  return rows.map(mapAlerta).map(alertaPublico).filter(Boolean);
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
  const evidencias = db
    .prepare(
      `SELECT ae.id, ae.documento_id, ae.anexo_id, ae.fato_id, ae.papel,
              ae.trecho_fonte, ae.metadados_json,
              d.titulo AS documento_titulo, d.tipo AS documento_tipo,
              d.ano AS documento_ano, d.data_publicacao AS documento_data_publicacao,
              a.nome AS anexo_nome, a.tipo AS anexo_tipo, a.url AS anexo_url,
              f.tipo AS fato_tipo, f.subtipo AS fato_subtipo, f.descricao AS fato_descricao,
              f.quantidade AS fato_quantidade, f.unidade AS fato_unidade,
              f.valor AS fato_valor, f.confianca AS fato_confianca
         FROM alertas_evidencias ae
         LEFT JOIN documentos d ON d.id = ae.documento_id
         LEFT JOIN documentos_anexos a ON a.id = ae.anexo_id
         LEFT JOIN inteligencia_fatos f ON f.id = ae.fato_id
        WHERE ae.alerta_id = ?
        ORDER BY COALESCE(d.data_publicacao, '') DESC, ae.id ASC`
    )
    .all(id)
    .map((e) => ({
      ...e,
      metadados: fromJson(e.metadados_json, {}),
    }));
  return { ...mapAlerta(row), documentos, evidencias };
}

function getAlertaPublico(id) {
  return alertaPublico(getAlerta(id));
}

function listarInvestigacoesPendentes({ limite = 5, incluirRevisao = false } = {}) {
  const rows = db
    .prepare(
      `SELECT id
         FROM alertas
        WHERE status = 'ativo'
          AND json_extract(metadados_json, '$.discovery_kind') = 'investigacao_factual'
          AND estado_editorial IN ('candidato', 'evidencias_prontas', 'analisado'${incluirRevisao ? ", 'revisao'" : ''})
        ORDER BY
          CAST(COALESCE(json_extract(metadados_json, '$.ano'), 0) AS INTEGER) DESC,
          CAST(COALESCE(json_extract(metadados_json, '$.prioridade'), 0) AS INTEGER) DESC,
          COALESCE(atualizado_em, criado_em) ASC
        LIMIT @limite`
    )
    .all({ limite: Math.max(Number(limite) || 1, 1) });
  return rows.map((row) => getAlerta(row.id)).filter(Boolean);
}

function setEstadoEditorial(id, estado, { origem = 'admin', motivos = [], exigirGateFactual = true } = {}) {
  if (!ESTADOS_EDITORIAIS.has(estado)) {
    throw new Error(`estado editorial inválido: ${estado}`);
  }
  const atual = getAlerta(id);
  if (!atual) {
    return false;
  }
  const factualAprovado = atual.metadados?.discovery_v3?.qualidade?.factual_status === 'aprovado';
  if (estado === 'publicado' && exigirGateFactual && !factualAprovado) {
    throw new Error('publicação bloqueada: gate factual não aprovado');
  }
  const publicadoEm = estado === 'publicado' ? atual.publicado_em || nowIso() : null;
  db.prepare(
    `UPDATE alertas
        SET estado_editorial = ?, qualidade_motivos_json = ?, publicado_em = ?, atualizado_em = ?
      WHERE id = ?`
  ).run(estado, toJson(motivos || []), publicadoEm, nowIso(), Number(id));
  if (atual.estado_editorial !== estado) {
    registrarHistorico({
      alertaId: Number(id),
      anterior: atual.estado_editorial,
      novo: estado,
      origem,
      motivos,
      evidenciasHash: atual.evidencias_hash || null,
    });
  }
  return true;
}

function listarHistoricoEditorial(alertaId) {
  return db
    .prepare(
      `SELECT * FROM alertas_editorial_historico
        WHERE alerta_id = ? ORDER BY datetime(criado_em) DESC, id DESC`
    )
    .all(Number(alertaId))
    .map((row) => ({ ...row, motivos: fromJson(row.motivos_json, []) }));
}

function garantirHistoricoEditorialInicial(alertaId, {
  estado,
  origem = 'migracao',
  motivos = [],
  evidenciasHash = null,
} = {}) {
  const existe = db
    .prepare('SELECT 1 FROM alertas_editorial_historico WHERE alerta_id = ? LIMIT 1')
    .get(Number(alertaId));
  if (existe) {return false;}
  registrarHistorico({
    alertaId: Number(alertaId),
    anterior: null,
    novo: estado,
    origem,
    motivos,
    evidenciasHash,
  });
  return true;
}

function contarPorEstadoEditorial(status = 'ativo') {
  const rows = db
    .prepare('SELECT estado_editorial, COUNT(*) AS n FROM alertas WHERE status = ? GROUP BY estado_editorial')
    .all(status);
  const out = { total: 0 };
  for (const row of rows) {
    out[row.estado_editorial || 'sem_estado'] = row.n;
    out.total += row.n;
  }
  return out;
}

function setAlertaStatus(id, status) {
  if (!STATUS_VALIDOS.has(status)) {
    throw new Error(`status inválido: ${status}`);
  }
  const r = db.prepare('UPDATE alertas SET status = ?, atualizado_em = ? WHERE id = ?').run(status, nowIso(), id);
  return r.changes > 0;
}

function contarPorSeveridade(status = 'ativo', estadoEditorial = null) {
  const rows = estadoEditorial
    ? db
      .prepare(
        'SELECT severidade, COUNT(*) AS n FROM alertas WHERE status = ? AND estado_editorial = ? GROUP BY severidade'
      )
      .all(status, estadoEditorial)
    : db
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
  ESTADOS_EDITORIAIS,
  buildEvidenciasHash,
  upsertAlerta,
  removerAtivosNaoListados,
  alertaPublico,
  listarAlertas,
  listarAlertasPublicos,
  listarDestaques,
  listarDestaquesPublicos,
  getAlerta,
  getAlertaPublico,
  listarInvestigacoesPendentes,
  setAlertaStatus,
  setEstadoEditorial,
  listarHistoricoEditorial,
  garantirHistoricoEditorialInicial,
  contarPorSeveridade,
  contarPorEstadoEditorial,
  getWatermark,
  setWatermark,
  getConfig,
  getAllConfig,
  setConfig,
};
