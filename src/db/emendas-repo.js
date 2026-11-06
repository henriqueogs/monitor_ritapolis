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
const { anoDeData } = require('../utils/datas');
const {
  higienizarGestorResponsavel,
  extrairDadosBancariosEmenda,
  extrairEmpenhosDadosDespesa,
  unificarEmendasPorInstrumento,
} = require('../parsers/emenda-parlamentar');

const TIPO_EMENDA = 'emenda_parlamentar';

// Ano da emenda (src/parsers/emenda-parlamentar.js → anoReferenciaEmenda). documentos.ano é o ano
// em que a ficha foi postada no site: só vale quando a emenda ainda não tem ano de referência.
const ANO_EMENDA = 'COALESCE(ed.ano_referencia, d.ano)';

// Chave de instrumento+parlamentar para unificar indicações da mesma resolução (ex.: Resolução N.10088/2025)
// sem fundir parlamentares distintos que compartilham o processo (ex.: 627 e 646).
const CHAVE_UNIFICADA_SQL = `CASE
  WHEN ed.numero_emenda IS NOT NULL AND ed.nome_parlamentar IS NOT NULL
  THEN IFNULL(ed.esfera, '') || '|' || LOWER(TRIM(ed.numero_emenda)) || '|' || LOWER(TRIM(ed.nome_parlamentar))
  ELSE 'id:' || CAST(d.id AS TEXT)
END`;

// ── Helpers ────────────────────────────────────────────────────────────────────

function buscarDespesaPorNumeroEmpenho(numeroEmpenho, anoReferencia) {
  if (!numeroEmpenho) { return null; }
  const rows = db
    .prepare(
      `SELECT id, empenho, exercicio_orcamento, data_empenho, data_liquidacao, data_pagamento,
              credor_nome, credor_cnpj, valor, historico
       FROM transparencia_despesas
       WHERE empenho = :empenho
       ORDER BY CASE WHEN exercicio_orcamento = :ano THEN 0 ELSE 1 END, data_empenho DESC
       LIMIT 1`
    )
    .all({ empenho: numeroEmpenho, ano: Number(anoReferencia) || 2025 });
  return rows[0] || null;
}

function enriquecerEmpenhosEmenda(row) {
  const extraidos = extrairEmpenhosDadosDespesa(row.dados_despesa);
  const anoRef = row.ano || anoDeData(row.data_recebimento) || 2025;
  return extraidos.map((item) => {
    const despesa = buscarDespesaPorNumeroEmpenho(item.numero_empenho, anoRef);
    return {
      ...item,
      despesa_id: despesa?.id || null,
      data_empenho: despesa?.data_empenho || null,
      data_liquidacao: despesa?.data_liquidacao || null,
      data_pagamento: despesa?.data_pagamento || null,
      credor_nome: despesa?.credor_nome || null,
      credor_cnpj: despesa?.credor_cnpj || null,
      valor_empenhado: despesa?.valor ?? null,
    };
  });
}

function rowToEmenda(row) {
  if (!row) { return null; }
  const dadosExtras = parseJson(row.dados_extras);
  const anoInstrumento = row.ano || null;
  const anoPublicacao = anoDeData(row.data_publicacao) || row.ano_publicacao || null;
  const divergenciaAno = Boolean(
    anoInstrumento && anoPublicacao && Number(anoInstrumento) !== Number(anoPublicacao)
  );
  const dadosBancarios =
    dadosExtras?.emenda_dados_bancarios ||
    extrairDadosBancariosEmenda(row.gestor_responsavel) ||
    extrairDadosBancariosEmenda(row.texto_completo);

  return {
    ...row,
    gestor_responsavel: higienizarGestorResponsavel(row.gestor_responsavel),
    dados_bancarios: dadosBancarios,
    empenhos_discriminados: enriquecerEmpenhosEmenda(row),
    ano_instrumento: anoInstrumento,
    ano_publicacao: anoPublicacao,
    divergencia_ano_publicacao: divergenciaAno,
    divergencia_ano_descricao: divergenciaAno
      ? `Emenda de ${anoInstrumento} publicada no portal em ${anoPublicacao}`
      : null,
    dados_extras: dadosExtras,
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
      ano_referencia, atualizado_em
    ) VALUES (
      :documento_id, :esfera, :numero_emenda, :nome_parlamentar, :cargo_parlamentar,
      :partido, :tipo_emenda, :tipo_transferencia, :objeto, :objeto_detalhado,
      :valor_repasse, :valor_repasse_raw, :valor_contrapartida,
      :orgao_transferidor, :instrumento_legal, :categoria_economica,
      :unidade_executora, :gestor_responsavel,
      :data_inicio, :data_termino, :data_recebimento, :dados_despesa,
      :ano_referencia, CURRENT_TIMESTAMP
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
      ano_referencia = excluded.ano_referencia,
      atualizado_em = CURRENT_TIMESTAMP
  `).run({
    documento_id: documentoId,
    esfera: campos.esfera ?? null,
    numero_emenda: campos.numero_emenda ?? null,
    nome_parlamentar: campos.nome_parlamentar ?? null,
    cargo_parlamentar: campos.cargo_parlamentar ?? null,
    partido: campos.partido ?? null,
    tipo_emenda: campos.tipo_emenda ?? null,
    tipo_transferencia: campos.tipo_transferencia ?? null,
    objeto: campos.objeto ?? null,
    objeto_detalhado: campos.objeto_detalhado ?? null,
    valor_repasse: campos.valor_repasse ?? null,
    valor_repasse_raw: campos.valor_repasse_raw ?? null,
    valor_contrapartida: campos.valor_contrapartida ?? null,
    orgao_transferidor: campos.orgao_transferidor ?? null,
    instrumento_legal: campos.instrumento_legal ?? null,
    categoria_economica: campos.categoria_economica ?? null,
    unidade_executora: campos.unidade_executora ?? null,
    gestor_responsavel: higienizarGestorResponsavel(campos.gestor_responsavel),
    data_inicio: campos.data_inicio ?? null,
    data_termino: campos.data_termino ?? null,
    data_recebimento: campos.data_recebimento ?? null,
    dados_despesa: campos.dados_despesa ?? null,
    ano_referencia: campos.ano_referencia ?? null,
  });
}

function getEmendaDetalhesByDocumentoId(documentoId) {
  return db.prepare(
    'SELECT * FROM emendas_detalhes WHERE documento_id = :id'
  ).get({ id: documentoId }) || null;
}

// ── Listagem e filtros ────────────────────────────────────────────────────────

const BASE_SELECT = `
  SELECT
    d.id, d.titulo, d.tipo, ${ANO_EMENDA} AS ano,
    COALESCE(CAST(substr(d.data_publicacao, 1, 4) AS INTEGER), d.ano) AS ano_publicacao,
    d.data_publicacao, d.url_origem, d.url_pdf,
    d.resumo, d.dados_extras,
    ed.esfera, ed.numero_emenda, ed.nome_parlamentar, ed.cargo_parlamentar,
    ed.partido, ed.tipo_emenda, ed.tipo_transferencia,
    ed.objeto, ed.objeto_detalhado,
    ed.valor_repasse, ed.valor_contrapartida,
    ed.orgao_transferidor, ed.instrumento_legal, ed.categoria_economica,
    ed.unidade_executora, ed.gestor_responsavel,
    ed.data_inicio, ed.data_termino, ed.data_recebimento, ed.dados_despesa,
    ed.ano_referencia
  FROM documentos d
  LEFT JOIN emendas_detalhes ed ON ed.documento_id = d.id
  WHERE d.tipo = '${TIPO_EMENDA}'
`;

function filtroAnoDualSql() {
  return `(${ANO_EMENDA} = :ano OR CAST(substr(d.data_publicacao, 1, 4) AS INTEGER) = :ano)`;
}

/**
 * Lista emendas com filtros opcionais, unificando parcelas da mesma resolução/parlamentar
 * e retornando registros quando filtrados tanto pelo ano do instrumento quanto
 * pelo ano de publicação.
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
    conditions.push(filtroAnoDualSql());
    params.ano = Number(ano);
  }

  const where = conditions.length ? ` AND ${conditions.join(' AND ')}` : '';
  const sql = `${BASE_SELECT}${where} ORDER BY d.data_publicacao DESC, d.id ASC`;

  const rows = db.prepare(sql).all(params).map(rowToEmenda);
  const unificadas = unificarEmendasPorInstrumento(rows);
  return unificadas.slice(offset, offset + limit);
}

function contarEmendas({ esfera, partido, nome_parlamentar, ano } = {}) {
  return listarEmendas({ esfera, partido, nome_parlamentar, ano, limit: 1000, offset: 0 }).length;
}

function getEmendaById(id) {
  const row = db.prepare(`${BASE_SELECT} AND d.id = :id`).get({ id });
  if (!row) { return null; }
  if (row.numero_emenda && row.nome_parlamentar) {
    const irmas = db
      .prepare(
        `${BASE_SELECT}
         AND ed.numero_emenda = :numero_emenda
         AND ed.nome_parlamentar = :nome_parlamentar
         AND IFNULL(ed.esfera, '') = IFNULL(:esfera, '')
         ORDER BY d.id ASC`
      )
      .all({
        numero_emenda: row.numero_emenda,
        nome_parlamentar: row.nome_parlamentar,
        esfera: row.esfera,
      })
      .map(rowToEmenda);
    if (irmas.length > 1) {
      const [unificada] = unificarEmendasPorInstrumento(irmas);
      return { ...unificada, id: Number(id) };
    }
  }
  return unificarEmendasPorInstrumento([rowToEmenda(row)])[0];
}

/**
 * Totais por ano para exibição no frontend (regra 11.1 do CLAUDE.md).
 * Retorna [{ ano, ano_publicacao, total_emendas, soma_repasse, esfera }]
 */
function totaisPorAno() {
  return db.prepare(`
    SELECT
      ${ANO_EMENDA} AS ano,
      MAX(CAST(substr(d.data_publicacao, 1, 4) AS INTEGER)) AS ano_publicacao,
      ed.esfera,
      COUNT(DISTINCT ${CHAVE_UNIFICADA_SQL}) as total_emendas,
      SUM(ed.valor_repasse) as soma_repasse
    FROM documentos d
    LEFT JOIN emendas_detalhes ed ON ed.documento_id = d.id
    WHERE d.tipo = '${TIPO_EMENDA}'
    GROUP BY 1, ed.esfera
    ORDER BY 1 DESC, ed.esfera
  `).all();
}

/**
 * Parlamentares distintos com totais — para filtro e ranking.
 */
function parlamentaresComTotais({ esfera, ano } = {}) {
  const conditions = [];
  const params = {};
  if (esfera) { conditions.push('ed.esfera = :esfera'); params.esfera = esfera; }
  if (ano) { conditions.push(filtroAnoDualSql()); params.ano = Number(ano); }
  const where = conditions.length ? ` AND ${conditions.join(' AND ')}` : '';

  return db.prepare(`
    SELECT
      ed.nome_parlamentar,
      ed.cargo_parlamentar,
      ed.partido,
      ed.esfera,
      COUNT(DISTINCT ${CHAVE_UNIFICADA_SQL}) as total_emendas,
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
