'use strict';

/**
 * Repositório de emendas parlamentares.
 * Tabelas: emendas_detalhes (JOIN com documentos)
 *
 * Emendas vivem em `documentos` (tipo = 'emenda_parlamentar').
 * Este repo expõe queries especializadas e gerencia emendas_detalhes.
 */

const { db } = require('./connection');
const { parseJson } = require('./documentos-repo');

const TIPO_EMENDA = 'emenda_parlamentar';

// ── Helpers ────────────────────────────────────────────────────────────────────

function rowToEmenda(row) {
  if (!row) { return null; }
  return {
    ...row,
    dados_extras: parseJson(row.dados_extras),
  };
}

// ── Emendas Detalhes ───────────────────────────────────────────────────────────

/**
 * Upsert dos campos estruturados extraídos pelo parser.
 * Chama após parsear o texto_completo de um documento de emenda.
 */
function salvarEmendaDetalhes(documentoId, campos) {
  db.prepare(`
    INSERT INTO emendas_detalhes (
      documento_id, esfera, numero_emenda, nome_parlamentar, cargo_parlamentar,
      partido, tipo_emenda, tipo_transferencia, objeto, objeto_detalhado,
      valor_repasse, valor_repasse_raw, valor_contrapartida,
      orgao_transferidor, instrumento_legal, categoria_economica,
      unidade_executora, gestor_responsavel,
      data_inicio, data_termino, data_recebimento, dados_despesa,
      atualizado_em
    ) VALUES (
      :documento_id, :esfera, :numero_emenda, :nome_parlamentar, :cargo_parlamentar,
      :partido, :tipo_emenda, :tipo_transferencia, :objeto, :objeto_detalhado,
      :valor_repasse, :valor_repasse_raw, :valor_contrapartida,
      :orgao_transferidor, :instrumento_legal, :categoria_economica,
      :unidade_executora, :gestor_responsavel,
      :data_inicio, :data_termino, :data_recebimento, :dados_despesa,
      CURRENT_TIMESTAMP
    )
    ON CONFLICT(documento_id) DO UPDATE SET
      esfera = excluded.esfera,
      numero_emenda = excluded.numero_emenda,
      nome_parlamentar = excluded.nome_parlamentar,
      cargo_parlamentar = excluded.cargo_parlamentar,
      partido = excluded.partido,
      tipo_emenda = excluded.tipo_emenda,
      tipo_transferencia = excluded.tipo_transferencia,
      objeto = excluded.objeto,
      objeto_detalhado = excluded.objeto_detalhado,
      valor_repasse = excluded.valor_repasse,
      valor_repasse_raw = excluded.valor_repasse_raw,
      valor_contrapartida = excluded.valor_contrapartida,
      orgao_transferidor = excluded.orgao_transferidor,
      instrumento_legal = excluded.instrumento_legal,
      categoria_economica = excluded.categoria_economica,
      unidade_executora = excluded.unidade_executora,
      gestor_responsavel = excluded.gestor_responsavel,
      data_inicio = excluded.data_inicio,
      data_termino = excluded.data_termino,
      data_recebimento = excluded.data_recebimento,
      dados_despesa = excluded.dados_despesa,
      atualizado_em = CURRENT_TIMESTAMP
  `).run({ documento_id: documentoId, ...campos });
}

function getEmendaDetalhesByDocumentoId(documentoId) {
  return db.prepare(
    'SELECT * FROM emendas_detalhes WHERE documento_id = :id'
  ).get({ id: documentoId }) || null;
}

// ── Listagem e filtros ────────────────────────────────────────────────────────

const BASE_SELECT = `
  SELECT
    d.id, d.titulo, d.tipo, d.ano, d.data_publicacao, d.url_origem, d.url_pdf,
    d.resumo, d.dados_extras,
    ed.esfera, ed.numero_emenda, ed.nome_parlamentar, ed.cargo_parlamentar,
    ed.partido, ed.tipo_emenda, ed.tipo_transferencia,
    ed.objeto, ed.objeto_detalhado,
    ed.valor_repasse, ed.valor_contrapartida,
    ed.orgao_transferidor, ed.instrumento_legal, ed.categoria_economica,
    ed.unidade_executora, ed.gestor_responsavel,
    ed.data_inicio, ed.data_termino, ed.data_recebimento, ed.dados_despesa
  FROM documentos d
  LEFT JOIN emendas_detalhes ed ON ed.documento_id = d.id
  WHERE d.tipo = '${TIPO_EMENDA}'
`;

/**
 * Lista emendas com filtros opcionais.
 * @param {object} filtros - { esfera, partido, nome_parlamentar, ano, limit, offset }
 */
function listarEmendas({ esfera, partido, nome_parlamentar, ano, limit = 50, offset = 0 } = {}) {
  const conditions = [];
  const params = {};

  if (esfera) {
    conditions.push('ed.esfera = :esfera');
    params.esfera = esfera;
  }
  if (partido) {
    conditions.push('ed.partido = :partido');
    params.partido = partido;
  }
  if (nome_parlamentar) {
    conditions.push('ed.nome_parlamentar LIKE :nome_parlamentar');
    params.nome_parlamentar = `%${nome_parlamentar}%`;
  }
  if (ano) {
    conditions.push('d.ano = :ano');
    params.ano = Number(ano);
  }

  const where = conditions.length ? ` AND ${conditions.join(' AND ')}` : '';
  const sql = `${BASE_SELECT}${where} ORDER BY d.data_publicacao DESC, d.id DESC LIMIT :limit OFFSET :offset`;

  return db.prepare(sql).all({ ...params, limit, offset }).map(rowToEmenda);
}

function contarEmendas({ esfera, partido, nome_parlamentar, ano } = {}) {
  const conditions = [];
  const params = {};

  if (esfera) { conditions.push('ed.esfera = :esfera'); params.esfera = esfera; }
  if (partido) { conditions.push('ed.partido = :partido'); params.partido = partido; }
  if (nome_parlamentar) {
    conditions.push('ed.nome_parlamentar LIKE :nome_parlamentar');
    params.nome_parlamentar = `%${nome_parlamentar}%`;
  }
  if (ano) { conditions.push('d.ano = :ano'); params.ano = Number(ano); }

  const where = conditions.length ? ` AND ${conditions.join(' AND ')}` : '';
  const sql = `
    SELECT COUNT(*) as total
    FROM documentos d
    LEFT JOIN emendas_detalhes ed ON ed.documento_id = d.id
    WHERE d.tipo = '${TIPO_EMENDA}'${where}
  `;

  return db.prepare(sql).get(params).total;
}

function getEmendaById(id) {
  const row = db.prepare(`${BASE_SELECT} AND d.id = :id`).get({ id });
  return rowToEmenda(row);
}

/**
 * Totais por ano para exibição no frontend (regra 11.1 do CLAUDE.md).
 * Retorna [{ ano, total_emendas, soma_repasse, esfera }]
 */
function totaisPorAno() {
  return db.prepare(`
    SELECT
      d.ano,
      ed.esfera,
      COUNT(*) as total_emendas,
      SUM(ed.valor_repasse) as soma_repasse
    FROM documentos d
    LEFT JOIN emendas_detalhes ed ON ed.documento_id = d.id
    WHERE d.tipo = '${TIPO_EMENDA}'
    GROUP BY d.ano, ed.esfera
    ORDER BY d.ano DESC, ed.esfera
  `).all();
}

/**
 * Parlamentares distintos com totais — para filtro e ranking.
 */
function parlamentaresComTotais({ esfera, ano } = {}) {
  const conditions = [];
  const params = {};
  if (esfera) { conditions.push('ed.esfera = :esfera'); params.esfera = esfera; }
  if (ano) { conditions.push('d.ano = :ano'); params.ano = Number(ano); }
  const where = conditions.length ? ` AND ${conditions.join(' AND ')}` : '';

  return db.prepare(`
    SELECT
      ed.nome_parlamentar,
      ed.cargo_parlamentar,
      ed.partido,
      ed.esfera,
      COUNT(*) as total_emendas,
      SUM(ed.valor_repasse) as soma_repasse
    FROM documentos d
    LEFT JOIN emendas_detalhes ed ON ed.documento_id = d.id
    WHERE d.tipo = '${TIPO_EMENDA}' AND ed.nome_parlamentar IS NOT NULL${where}
    GROUP BY ed.nome_parlamentar, ed.partido, ed.esfera
    ORDER BY soma_repasse DESC
  `).all(params);
}

module.exports = {
  salvarEmendaDetalhes,
  getEmendaDetalhesByDocumentoId,
  listarEmendas,
  contarEmendas,
  getEmendaById,
  totaisPorAno,
  parlamentaresComTotais,
};
