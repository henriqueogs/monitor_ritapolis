'use strict';

// Gravação dos resultados homologados do PNCP em licitacoes_detalhes.
// Só CRUD: a regra de consolidação e a escolha do documento canônico ficam em
// src/licitacoes/pncp-resultados.js. Substitui o antigo upsertDadosPncp
// (src/db/index.js, removido), que mantinha origem/trecho do valor anterior e o
// vencedor do texto ao lado do total de vários fornecedores (fiscal-valores 28/10).

const { db } = require('./connection');
const logger = require('../logger');
const { aplicarGatePlausibilidadeItemProcesso } = require('./produtos-plausibilidade-repo');

const ORIGEM_PNCP = 'pncp_orgaos';
const ORIGEM_DETALHE_RESULTADOS = 'pncp_resultados';

function listarDocumentosPorNumeroPncp(numeroPncp) {
  if (!numeroPncp) {return [];}
  return db
    .prepare(
      `SELECT d.id, d.fonte, d.tipo
       FROM documentos d
       JOIN licitacoes_detalhes ld ON ld.documento_id = d.id
       WHERE ld.numero_pncp = ?
       ORDER BY d.id`
    )
    .all(String(numeroPncp));
}

/**
 * Valor, data e origem passam a ser do PNCP juntos (o trecho e a confiança do valor
 * anterior saem). Vencedor: o único fornecedor; com vários, fica null (nunca o
 * vencedor antigo ao lado do total de todos).
 */
function gravarResultadoPncp(documentoId, dados) {
  if (dados.valor_final === null || dados.valor_final === undefined) {
    throw new Error('gravarResultadoPncp: valor_final obrigatório (compra fechada e precificada)');
  }
  const changes = db
    .prepare(
      `INSERT INTO licitacoes_detalhes (documento_id, vencedor_nome, vencedor_cnpj, valor_final,
         numero_pncp, data_homologacao, origem, origem_detalhe, atualizado_em)
       VALUES (@documento_id, @vencedor_nome, @vencedor_cnpj, @valor_final,
         @numero_pncp, @data_homologacao, @origem, @origem_detalhe, @agora)
       ON CONFLICT(documento_id) DO UPDATE SET
         vencedor_nome = CASE WHEN @vencedor_nome IS NOT NULL OR @multiplos = 1
                              THEN @vencedor_nome ELSE licitacoes_detalhes.vencedor_nome END,
         vencedor_cnpj = CASE WHEN @vencedor_cnpj IS NOT NULL OR @multiplos = 1
                              THEN @vencedor_cnpj ELSE licitacoes_detalhes.vencedor_cnpj END,
         valor_final = @valor_final,
         numero_pncp = COALESCE(licitacoes_detalhes.numero_pncp, @numero_pncp),
         data_homologacao = @data_homologacao,
         origem = @origem,
         origem_detalhe = @origem_detalhe,
         trecho_fonte = NULL,
         confianca = NULL,
         atualizado_em = @agora`
    )
    .run({
      documento_id: Number(documentoId),
      vencedor_nome: dados.vencedor_nome || null,
      vencedor_cnpj: dados.vencedor_cnpj || null,
      multiplos: dados.multiplos_fornecedores ? 1 : 0,
      valor_final: dados.valor_final,
      numero_pncp: dados.numero_pncp || null,
      data_homologacao: dados.data_resultado || null,
      origem: ORIGEM_PNCP,
      origem_detalhe: ORIGEM_DETALHE_RESULTADOS,
      agora: new Date().toISOString(),
    }).changes;

  // Mesmo guard-rail das outras escritas de valor final: itens acima do processo vão
  // para quarentena. Falha do gate não derruba a sincronização.
  try {
    aplicarGatePlausibilidadeItemProcesso({ documentoId: Number(documentoId) });
  } catch (err) {
    logger.warn('gate de plausibilidade item×processo falhou após resultado PNCP', {
      documento_id: documentoId,
      erro: err.message,
    });
  }
  return changes || 0;
}

module.exports = { listarDocumentosPorNumeroPncp, gravarResultadoPncp };
