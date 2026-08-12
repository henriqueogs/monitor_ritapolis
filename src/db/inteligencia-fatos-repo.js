'use strict';

const crypto = require('crypto');
const { db } = require('./connection');

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

function mapResumo(row) {
  if (!row || !row.id) {
    return null;
  }
  return {
    ...row,
    dados: fromJson(row.resumo_json, {}),
  };
}

function mapFato(row) {
  if (!row) {
    return null;
  }
  return {
    ...row,
    metadados: fromJson(row.metadados_json, {}),
  };
}

function mapAnexo(row) {
  if (!row) {
    return null;
  }
  return {
    ...row,
    resumo_ai: mapResumo({
      id: row.resumo_id,
      anexo_id: row.id,
      provider: row.resumo_provider,
      modelo: row.resumo_modelo,
      contrato_versao: row.resumo_contrato_versao,
      resumo_json: row.resumo_json,
      texto_hash: row.resumo_texto_hash,
      tokens_estimados: row.resumo_tokens_estimados,
      confianca: row.resumo_confianca,
      status: row.resumo_status,
      erro: row.resumo_erro,
      criado_em: row.resumo_criado_em,
      atualizado_em: row.resumo_atualizado_em,
    }),
    texto_completo_chars: row.texto_completo ? row.texto_completo.length : 0,
  };
}

function resumoJoinSql() {
  return `
    LEFT JOIN documentos_anexos_resumos_ai r ON r.id = (
      SELECT r2.id
        FROM documentos_anexos_resumos_ai r2
       WHERE r2.anexo_id = a.id
       ORDER BY r2.atualizado_em DESC, r2.id DESC
       LIMIT 1
    )
  `;
}

function resumoSelectSql() {
  return `
    r.id AS resumo_id,
    r.provider AS resumo_provider,
    r.modelo AS resumo_modelo,
    r.contrato_versao AS resumo_contrato_versao,
    r.resumo_json AS resumo_json,
    r.texto_hash AS resumo_texto_hash,
    r.tokens_estimados AS resumo_tokens_estimados,
    r.confianca AS resumo_confianca,
    r.status AS resumo_status,
    r.erro AS resumo_erro,
    r.criado_em AS resumo_criado_em,
    r.atualizado_em AS resumo_atualizado_em
  `;
}

function listarAnexosDocumento(documentoId) {
  const rows = db
    .prepare(
      `SELECT a.*, ${resumoSelectSql()}
         FROM documentos_anexos a
         ${resumoJoinSql()}
        WHERE a.documento_id = ?
        ORDER BY a.id ASC`
    )
    .all(Number(documentoId));
  return rows.map(mapAnexo);
}

function getAnexoById(id) {
  const row = db
    .prepare(
      `SELECT a.*, ${resumoSelectSql()},
              d.titulo AS documento_titulo, d.tipo AS documento_tipo,
              d.ano AS documento_ano, d.data_publicacao AS documento_data_publicacao,
              d.url_origem AS documento_url_origem, d.url_pdf AS documento_url_pdf
         FROM documentos_anexos a
         JOIN documentos d ON d.id = a.documento_id
         ${resumoJoinSql()}
        WHERE a.id = ?`
    )
    .get(Number(id));
  if (!row) {
    return null;
  }
  return {
    ...mapAnexo(row),
    documento_pai: {
      id: row.documento_id,
      titulo: row.documento_titulo,
      tipo: row.documento_tipo,
      ano: row.documento_ano,
      data_publicacao: row.documento_data_publicacao,
      url_origem: row.documento_url_origem,
      url_pdf: row.documento_url_pdf,
    },
  };
}

function salvarResumoAnexo({
  anexo_id,
  provider = 'local',
  modelo = 'heuristico',
  contrato_versao = 'anexo-1.0',
  resumo_json,
  texto_hash,
  tokens_estimados = null,
  confianca = null,
  status = 'ok',
  erro = null,
}) {
  const agora = nowIso();
  db.prepare(
    `INSERT INTO documentos_anexos_resumos_ai (
       anexo_id, provider, modelo, contrato_versao, resumo_json, texto_hash,
       tokens_estimados, confianca, status, erro, criado_em, atualizado_em
     ) VALUES (
       @anexo_id, @provider, @modelo, @contrato_versao, @resumo_json, @texto_hash,
       @tokens_estimados, @confianca, @status, @erro, @agora, @agora
     )
     ON CONFLICT(anexo_id, texto_hash, contrato_versao) DO UPDATE SET
       provider = excluded.provider,
       modelo = excluded.modelo,
       resumo_json = excluded.resumo_json,
       tokens_estimados = excluded.tokens_estimados,
       confianca = excluded.confianca,
       status = excluded.status,
       erro = excluded.erro,
       atualizado_em = excluded.atualizado_em`
  ).run({
    anexo_id: Number(anexo_id),
    provider,
    modelo,
    contrato_versao,
    resumo_json: toJson(resumo_json),
    texto_hash,
    tokens_estimados,
    confianca,
    status,
    erro,
    agora,
  });

  return db
    .prepare(
      `SELECT *
         FROM documentos_anexos_resumos_ai
        WHERE anexo_id = ? AND texto_hash = ? AND contrato_versao = ?`
    )
    .get(Number(anexo_id), texto_hash, contrato_versao);
}

function upsertFato(fato) {
  const agora = nowIso();
  const origemHash = fato.origem_hash || buildHash({
    documento_id: fato.documento_id,
    anexo_id: fato.anexo_id || null,
    tipo: fato.tipo,
    subtipo: fato.subtipo || null,
    quantidade: fato.quantidade ?? null,
    unidade: fato.unidade || null,
    trecho_fonte: fato.trecho_fonte || null,
    origem: fato.origem || 'extracao_factual',
  });

  db.prepare(
    `INSERT INTO inteligencia_fatos (
       documento_id, anexo_id, tipo, subtipo, descricao, quantidade, unidade,
       valor, data_evento, periodo_inicio, periodo_fim, local, ator, trecho_fonte,
       confianca, origem, origem_hash, metadados_json, criado_em, atualizado_em
     ) VALUES (
       @documento_id, @anexo_id, @tipo, @subtipo, @descricao, @quantidade, @unidade,
       @valor, @data_evento, @periodo_inicio, @periodo_fim, @local, @ator, @trecho_fonte,
       @confianca, @origem, @origem_hash, @metadados_json, @agora, @agora
     )
     ON CONFLICT(origem_hash) DO UPDATE SET
       descricao = excluded.descricao,
       quantidade = excluded.quantidade,
       unidade = excluded.unidade,
       valor = excluded.valor,
       data_evento = excluded.data_evento,
       periodo_inicio = excluded.periodo_inicio,
       periodo_fim = excluded.periodo_fim,
       local = excluded.local,
       ator = excluded.ator,
       trecho_fonte = excluded.trecho_fonte,
       confianca = excluded.confianca,
       metadados_json = excluded.metadados_json,
       atualizado_em = excluded.atualizado_em`
  ).run({
    documento_id: Number(fato.documento_id),
    anexo_id: fato.anexo_id ? Number(fato.anexo_id) : null,
    tipo: fato.tipo,
    subtipo: fato.subtipo || null,
    descricao: fato.descricao,
    quantidade: fato.quantidade ?? null,
    unidade: fato.unidade || null,
    valor: fato.valor ?? null,
    data_evento: fato.data_evento || null,
    periodo_inicio: fato.periodo_inicio || null,
    periodo_fim: fato.periodo_fim || null,
    local: fato.local || null,
    ator: fato.ator || null,
    trecho_fonte: fato.trecho_fonte || null,
    confianca: fato.confianca ?? null,
    origem: fato.origem || 'extracao_factual',
    origem_hash: origemHash,
    metadados_json: toJson(fato.metadados || null),
    agora,
  });

  return db.prepare('SELECT * FROM inteligencia_fatos WHERE origem_hash = ?').get(origemHash);
}

function substituirFatosOrigem({ documentoId, anexoId = null, origemPrefixo, fatos = [] }) {
  const params = { documentoId: Number(documentoId), origem: `${origemPrefixo}%` };
  const filters = ['documento_id = @documentoId', 'origem LIKE @origem'];
  if (anexoId) {
    filters.push('anexo_id = @anexoId');
    params.anexoId = Number(anexoId);
  } else {
    filters.push('anexo_id IS NULL');
  }
  db.prepare(`DELETE FROM inteligencia_fatos WHERE ${filters.join(' AND ')}`).run(params);
  return fatos.map(upsertFato).filter(Boolean);
}

function listarFatosDocumento(documentoId) {
  return db
    .prepare(
      `SELECT f.*, a.nome AS anexo_nome, a.tipo AS anexo_tipo
         FROM inteligencia_fatos f
         LEFT JOIN documentos_anexos a ON a.id = f.anexo_id
        WHERE f.documento_id = ?
        ORDER BY f.tipo, f.subtipo, f.id`
    )
    .all(Number(documentoId))
    .map(mapFato);
}

function listarFatosAnexo(anexoId) {
  return db
    .prepare(
      `SELECT f.*
         FROM inteligencia_fatos f
        WHERE f.anexo_id = ?
        ORDER BY f.tipo, f.subtipo, f.id`
    )
    .all(Number(anexoId))
    .map(mapFato);
}

function listarFatosParaAlertas({ tipo, subtipo, ano, limite = 5000 } = {}) {
  const filters = [];
  const params = { limite: Number(limite) || 5000 };
  if (tipo) {
    filters.push('f.tipo = @tipo');
    params.tipo = tipo;
  }
  if (subtipo) {
    filters.push('f.subtipo = @subtipo');
    params.subtipo = subtipo;
  }
  if (ano) {
    filters.push('d.ano = @ano');
    params.ano = Number(ano);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  return db
    .prepare(
      `SELECT f.*, d.titulo, d.numero AS documento_numero, d.ano, d.data_publicacao,
              d.url_origem, d.valor_estimado AS documento_valor_estimado,
              ld.vencedor_nome, ld.vencedor_cnpj, ld.valor_final AS documento_valor_final,
              a.nome AS anexo_nome, a.url AS anexo_url
         FROM inteligencia_fatos f
         JOIN documentos d ON d.id = f.documento_id
         LEFT JOIN licitacoes_detalhes ld ON ld.documento_id = d.id
         LEFT JOIN documentos_anexos a ON a.id = f.anexo_id
        ${where}
        ORDER BY COALESCE(f.periodo_inicio, f.data_evento, d.data_publicacao, '') DESC, f.id DESC
        LIMIT @limite`
    )
    .all(params)
    .map(mapFato);
}

module.exports = {
  buildHash,
  fromJson,
  toJson,
  listarAnexosDocumento,
  getAnexoById,
  salvarResumoAnexo,
  upsertFato,
  substituirFatosOrigem,
  listarFatosDocumento,
  listarFatosAnexo,
  listarFatosParaAlertas,
};
