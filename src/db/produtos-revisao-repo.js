'use strict';

/**
 * Repositório de revisão de produtos de licitação — Monitor Ritápolis.
 *
 * Suporta o fluxo de curadoria humana em /admin/qualidade: listar produtos
 * extraídos pendentes (priorizando os de menor confiança), validar ou rejeitar
 * item a item, e validar em lote os de alta confiança.
 *
 * Apenas CRUD/consulta — sem regra de negócio (DDD). As funções aceitam uma
 * conexão opcional `conn` para permitir testes com SQLite :memory:; em produção
 * usam o singleton.
 */

const { db } = require('./index');

const STATUS_REVISAO = {
  PENDENTE: 'pendente',
  VALIDADO: 'validado',
  REJEITADO: 'rejeitado',
};

const STATUS_VALIDOS = new Set(Object.values(STATUS_REVISAO));

const LIMITE_PADRAO = 50;
const CONFIANCA_LOTE_PADRAO = 0.8;

function contarProdutosRevisao(conn = db) {
  const por_status = conn
    .prepare('SELECT status_revisao AS status, COUNT(*) AS n FROM licitacoes_produtos GROUP BY status_revisao')
    .all();

  const por_confianca_pendente = conn
    .prepare(
      `SELECT CASE
                WHEN confianca IS NULL THEN 'sem_confianca'
                WHEN confianca >= 0.8 THEN 'alta'
                WHEN confianca >= 0.5 THEN 'media'
                ELSE 'baixa'
              END AS faixa,
              COUNT(*) AS n
         FROM licitacoes_produtos
        WHERE status_revisao = 'pendente'
        GROUP BY faixa`
    )
    .all();

  return { por_status, por_confianca_pendente };
}

function listProdutosParaRevisao(
  { confiancaMax, documentoId, limite = LIMITE_PADRAO, pagina = 1 } = {},
  conn = db
) {
  const filters = ["lp.status_revisao = 'pendente'"];
  const params = {};

  if (confiancaMax !== undefined && confiancaMax !== null) {
    filters.push('IFNULL(lp.confianca, 0) <= @confiancaMax');
    params.confiancaMax = Number(confiancaMax);
  }

  if (documentoId) {
    filters.push('lp.documento_id = @documentoId');
    params.documentoId = Number(documentoId);
  }

  const where = `WHERE ${filters.join(' AND ')}`;
  const total = conn
    .prepare(`SELECT COUNT(*) AS total FROM licitacoes_produtos lp ${where}`)
    .get(params).total;

  const limiteNum = Math.min(Math.max(Number(limite) || LIMITE_PADRAO, 1), 200);
  const offset = (Math.max(Number(pagina) || 1, 1) - 1) * limiteNum;

  const itens = conn
    .prepare(
      `SELECT lp.id, lp.documento_id, lp.descricao, lp.unidade, lp.quantidade,
              lp.valor_unitario_final, lp.valor_total_final, lp.fornecedor_nome,
              lp.origem, lp.origem_detalhe, lp.trecho_fonte, lp.confianca,
              lp.status_revisao,
              d.numero AS documento_numero, d.ano AS documento_ano, d.titulo AS documento_titulo,
              d.url_origem AS documento_url_origem, d.url_pdf AS documento_url_pdf
         FROM licitacoes_produtos lp
         JOIN documentos d ON d.id = lp.documento_id
         ${where}
         ORDER BY IFNULL(lp.confianca, 0) ASC, lp.documento_id, lp.id
         LIMIT @limite OFFSET @offset`
    )
    .all({ ...params, limite: limiteNum, offset });

  return { total, itens, pagina: Math.max(Number(pagina) || 1, 1), limite: limiteNum };
}

function setProdutoStatusRevisao(id, status, conn = db) {
  if (!STATUS_VALIDOS.has(status)) {
    throw new Error(`status_revisao inválido: ${status}`);
  }

  conn
    .prepare(
      "UPDATE licitacoes_produtos SET status_revisao = @status, atualizado_em = CURRENT_TIMESTAMP WHERE id = @id"
    )
    .run({ id: Number(id), status });

  return conn.prepare('SELECT id, status_revisao FROM licitacoes_produtos WHERE id = ?').get(Number(id));
}

function validarLoteProdutos({ documentoId, confiancaMin = CONFIANCA_LOTE_PADRAO } = {}, conn = db) {
  const filters = ["status_revisao = 'pendente'", 'IFNULL(confianca, 0) >= @confiancaMin'];
  const params = { confiancaMin: Number(confiancaMin), status: STATUS_REVISAO.VALIDADO };

  if (documentoId) {
    filters.push('documento_id = @documentoId');
    params.documentoId = Number(documentoId);
  }

  const result = conn
    .prepare(
      `UPDATE licitacoes_produtos
          SET status_revisao = @status, atualizado_em = CURRENT_TIMESTAMP
        WHERE ${filters.join(' AND ')}`
    )
    .run(params);

  return result.changes;
}

module.exports = {
  STATUS_REVISAO,
  contarProdutosRevisao,
  listProdutosParaRevisao,
  setProdutoStatusRevisao,
  validarLoteProdutos,
};
