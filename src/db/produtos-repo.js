'use strict';

/**
 * Repositório de consultas de produtos de licitações.
 * Mantém as leituras e agregações de produtos fora do repositório legado
 * src/db/index.js, que ainda concentra operações cross-domain de escrita.
 */

const { db } = require('./connection');
const { likeParam } = require('./documentos-repo');
const { normalizeText } = require('../utils/text');

function normalizeProdutoRow(row) {
  if (!row) { return null; }

  return {
    ...Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        typeof value === 'string' ? normalizeText(value) : value
      ])
    ),
    validacao_status: row.validacao_status || (row.validacoes_total ? 'revisar' : 'pendente'),
    validacoes_total: Number(row.validacoes_total || 0),
    // Quarentena do gate item×processo: a UI não exibe o valor como "Final"
    valor_final_quarentenado: row.plausibilidade_status === 'implausivel',
    // Teto homologado acima do empenhado (registro de preços): valor legítimo
    // da fonte que a UI exibe com nota de contexto
    valor_final_contexto_empenho: row.plausibilidade_status === 'contexto_empenho',
    // Anexo (ata) de onde o valor veio — origem rastreável §11.3
    anexo_origem_id: extrairAnexoOrigemId(row.origem_detalhe)
  };
}

// 'ata:negociacao:ata_resultado:documentos_anexos:21:Ata.pdf' → 21
function extrairAnexoOrigemId(origemDetalhe) {
  const match = String(origemDetalhe || '').match(/documentos_anexos:(\d+)/);
  return match ? Number(match[1]) : null;
}

function buildProdutosWhere({ ano, documentoId, termo, origem, validacao }, params) {
  const filters = [];

  if (ano) {
    filters.push('lp.ano = @ano');
    params.ano = Number(ano);
  }

  if (documentoId) {
    filters.push('lp.documento_id = @documentoId');
    params.documentoId = Number(documentoId);
  }

  if (termo) {
    filters.push(
      `(lp.descricao LIKE @termo
        OR IFNULL(lp.descricao_normalizada, '') LIKE @termo
        OR IFNULL(lp.fornecedor_nome, '') LIKE @termo
        OR IFNULL(d.numero, '') LIKE @termo
        OR IFNULL(d.titulo, '') LIKE @termo)`
    );
    params.termo = likeParam(termo);
  }

  if (origem) {
    filters.push('lp.origem = @origem');
    params.origem = origem;
  }

  if (validacao) {
    if (validacao === 'sem_validacao') {
      filters.push(
        `NOT EXISTS (
          SELECT 1 FROM licitacoes_produtos_validacoes v
          WHERE v.produto_id = lp.id
        )`
      );
    } else {
      filters.push(
        `EXISTS (
          SELECT 1 FROM licitacoes_produtos_validacoes v
          WHERE v.produto_id = lp.id
            AND v.status = @validacao
        )`
      );
      params.validacao = validacao;
    }
  }

  return filters.length ? `WHERE ${filters.join(' AND ')}` : '';
}

function listLicitacaoProdutos({
  ano,
  documentoId,
  termo,
  origem,
  validacao,
  pagina = 1,
  limite = 20
} = {}) {
  const params = {};
  const whereClause = buildProdutosWhere({ ano, documentoId, termo, origem, validacao }, params);
  const safePagina = Math.max(Number(pagina || 1), 1);
  const safeLimite = Math.min(Math.max(Number(limite || 20), 1), 500);
  const offset = (safePagina - 1) * safeLimite;

  const total = db
    .prepare(
      `SELECT COUNT(*) AS total
       FROM licitacoes_produtos lp
       JOIN documentos d ON d.id = lp.documento_id
       ${whereClause}`
    )
    .get(params).total;

  const dados = db
    .prepare(
      `SELECT lp.*,
              d.numero AS documento_numero,
              d.titulo AS documento_titulo,
              d.fonte AS documento_fonte,
              d.url_origem AS documento_url_origem,
              d.url_pdf AS documento_url_pdf,
              (
                SELECT v.status
                FROM licitacoes_produtos_validacoes v
                WHERE v.produto_id = lp.id
                ORDER BY datetime(v.validado_em) DESC, v.id DESC
                LIMIT 1
              ) AS validacao_status,
              (
                SELECT COUNT(*)
                FROM licitacoes_produtos_validacoes v
                WHERE v.produto_id = lp.id
              ) AS validacoes_total,
              (
                SELECT v.status
                FROM licitacoes_produtos_validacoes v
                WHERE v.produto_id = lp.id AND v.fonte = 'plausibilidade_item_processo'
                ORDER BY datetime(v.validado_em) DESC, v.id DESC
                LIMIT 1
              ) AS plausibilidade_status,
              (
                SELECT v.valor_encontrado
                FROM licitacoes_produtos_validacoes v
                WHERE v.produto_id = lp.id AND v.fonte = 'plausibilidade_item_processo'
                ORDER BY datetime(v.validado_em) DESC, v.id DESC
                LIMIT 1
              ) AS plausibilidade_valor_processo
       FROM licitacoes_produtos lp
       JOIN documentos d ON d.id = lp.documento_id
       ${whereClause}
       ORDER BY COALESCE(lp.ano, 0) DESC,
                lp.documento_id DESC,
                CAST(lp.lote_numero AS INTEGER),
                lp.lote_numero,
                CAST(lp.item_numero AS INTEGER),
                lp.item_numero,
                lp.id DESC
       LIMIT @limite OFFSET @offset`
    )
    .all({
      ...params,
      limite: safeLimite,
      offset
    })
    .map(normalizeProdutoRow);

  return {
    total,
    pagina: safePagina,
    limite: safeLimite,
    dados
  };
}

function getLicitacaoProdutosByDocumentoId(documentoId) {
  return listLicitacaoProdutos({
    documentoId,
    pagina: 1,
    limite: 500
  });
}

function getLicitacaoProdutosResumo(documentoId) {
  const row = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN valor_unitario_estimado IS NOT NULL OR valor_total_estimado IS NOT NULL THEN 1 ELSE 0 END) AS com_preco_estimado,
         SUM(CASE WHEN valor_unitario_final IS NOT NULL OR valor_total_final IS NOT NULL OR valor_lote_final IS NOT NULL OR valor_global_final IS NOT NULL THEN 1 ELSE 0 END) AS com_preco_final,
         SUM(CASE WHEN valor_lote_final IS NOT NULL THEN 1 ELSE 0 END) AS com_valor_lote_final,
         SUM(CASE WHEN valor_global_final IS NOT NULL THEN 1 ELSE 0 END) AS com_valor_global_final,
         SUM(CASE WHEN IFNULL(fornecedor_nome, '') <> '' THEN 1 ELSE 0 END) AS com_fornecedor,
         ROUND(IFNULL(SUM(valor_total_estimado), 0), 2) AS valor_estimado_total_identificado,
         ROUND(IFNULL(SUM(CASE
           WHEN valor_total_final IS NOT NULL THEN valor_total_final
           WHEN valor_unitario_final IS NOT NULL AND quantidade IS NOT NULL THEN valor_unitario_final * quantidade
           ELSE 0
         END), 0), 2) AS valor_final_total_identificado,
         ROUND(IFNULL(SUM(valor_lote_final), 0), 2) AS valor_lote_total_identificado,
         ROUND(IFNULL(SUM(valor_global_final), 0), 2) AS valor_global_total_identificado,
         SUM(CASE WHEN NOT EXISTS (
           SELECT 1
           FROM licitacoes_produtos_validacoes v
           WHERE v.produto_id = licitacoes_produtos.id
         ) THEN 1 ELSE 0 END) AS sem_validacao
       FROM licitacoes_produtos
       WHERE documento_id = ?`
    )
    .get(documentoId);

  return {
    total: row.total || 0,
    com_preco_estimado: row.com_preco_estimado || 0,
    com_preco_final: row.com_preco_final || 0,
    com_valor_lote_final: row.com_valor_lote_final || 0,
    com_valor_global_final: row.com_valor_global_final || 0,
    com_fornecedor: row.com_fornecedor || 0,
    valor_estimado_total_identificado: row.valor_estimado_total_identificado || 0,
    valor_final_total_identificado: row.valor_final_total_identificado || 0,
    valor_lote_total_identificado: row.valor_lote_total_identificado || 0,
    valor_global_total_identificado: row.valor_global_total_identificado || 0,
    sem_validacao: row.sem_validacao || 0
  };
}

function getProdutosGruposComparaveis({ limite = 50 } = {}) {
  return db
    .prepare(
      `SELECT g.id, g.rotulo_canonico, g.n_variacoes,
              COUNT(DISTINCT p.ano) AS n_anos,
              COUNT(*) AS n_itens,
              ROUND(MIN(p.valor_unitario_final), 2) AS preco_min,
              ROUND(MAX(p.valor_unitario_final), 2) AS preco_max,
              ROUND(AVG(p.valor_unitario_final), 2) AS preco_medio
         FROM produtos_grupos g
         JOIN licitacoes_produtos p ON p.grupo_id = g.id
        WHERE p.valor_unitario_final IS NOT NULL AND p.valor_unitario_final > 0 AND p.ano IS NOT NULL
        GROUP BY g.id
       HAVING n_anos >= 2
        ORDER BY n_anos DESC, n_itens DESC
        LIMIT @limite`
    )
    .all({ limite: Math.min(Math.max(Number(limite) || 50, 1), 200) });
}

function getEvolucaoPrecoGrupo(grupoId) {
  const grupo = db.prepare('SELECT id, rotulo_canonico, n_variacoes FROM produtos_grupos WHERE id = ?').get(Number(grupoId));
  if (!grupo) { return null; }

  const serie = db
    .prepare(
      `SELECT p.ano,
              ROUND(AVG(p.valor_unitario_final), 2) AS preco_medio,
              ROUND(MIN(p.valor_unitario_final), 2) AS preco_min,
              ROUND(MAX(p.valor_unitario_final), 2) AS preco_max,
              COUNT(*) AS n_itens
         FROM licitacoes_produtos p
        WHERE p.grupo_id = @grupoId AND p.valor_unitario_final IS NOT NULL
          AND p.valor_unitario_final > 0 AND p.ano IS NOT NULL
        GROUP BY p.ano
        ORDER BY p.ano`
    )
    .all({ grupoId: Number(grupoId) });

  const variacoes = db
    .prepare(
      `SELECT DISTINCT descricao_normalizada AS descricao
         FROM licitacoes_produtos WHERE grupo_id = ? ORDER BY descricao_normalizada`
    )
    .all(Number(grupoId))
    .map((r) => r.descricao);

  return { ...grupo, serie, variacoes };
}

module.exports = {
  buildProdutosWhere,
  getEvolucaoPrecoGrupo,
  getLicitacaoProdutosByDocumentoId,
  getLicitacaoProdutosResumo,
  getProdutosGruposComparaveis,
  listLicitacaoProdutos,
  normalizeProdutoRow,
};
