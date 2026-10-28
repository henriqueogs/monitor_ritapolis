'use strict';

// Gravação dos resultados homologados do PNCP em licitacoes_detalhes.
// Só CRUD: a regra de consolidação e a escolha do documento canônico ficam em
// src/licitacoes/pncp-resultados.js. Substitui o antigo upsertDadosPncp
// (src/db/index.js, removido), que mantinha origem/trecho do valor anterior e o
// vencedor do texto ao lado do total de vários fornecedores (fiscal-valores 28/10).

const { db } = require('./connection');
const logger = require('../logger');
const { aplicarGatePlausibilidadeItemProcesso } = require('./produtos-plausibilidade-repo');
const { normalizarControlePncp } = require('../licitacoes/pncp-resultados');

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
    .all(normalizarControlePncp(numeroPncp));
}

const ORIGEM_DETALHE_NAO_CANONICO = 'pncp_resultados_nao_canonico';

// Vencedor (nome e CNPJ sempre juntos): o único fornecedor; com vários, fica null.
const SQL_GRAVAR_CANONICO = `
  INSERT INTO licitacoes_detalhes (documento_id, vencedor_nome, vencedor_cnpj, valor_final,
    numero_pncp, data_homologacao, origem, origem_detalhe, atualizado_em)
  VALUES (@documento_id, @vencedor_nome, @vencedor_cnpj, @valor_final,
    @numero_pncp, @data_homologacao, @origem, @origem_detalhe, @agora)
  ON CONFLICT(documento_id) DO UPDATE SET
    vencedor_nome = CASE WHEN @vencedor_cnpj IS NOT NULL OR @multiplos = 1
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
    atualizado_em = @agora`;

// Os demais documentos do mesmo processo não carregam valor nem vencedor: senão o ano
// soma a compra duas vezes (inclusive quando o canônico muda entre execuções).
const SQL_NEUTRALIZAR_OUTROS = `
  UPDATE licitacoes_detalhes
  SET valor_final = NULL, vencedor_nome = NULL, vencedor_cnpj = NULL, data_homologacao = NULL,
      origem = @origem, origem_detalhe = @origem_detalhe, trecho_fonte = NULL, confianca = NULL,
      atualizado_em = @agora
  WHERE numero_pncp = @numero_pncp AND documento_id <> @documento_id`;

function rodarGate(documentoId) {
  // Mesmo guard-rail das outras escritas de valor final: itens acima do processo vão
  // para quarentena. Falha do gate não derruba a sincronização.
  try {
    aplicarGatePlausibilidadeItemProcesso({ documentoId });
  } catch (err) {
    logger.warn('gate de plausibilidade item×processo falhou após resultado PNCP', {
      documento_id: documentoId,
      erro: err.message,
    });
  }
}

/**
 * Grava o resultado no documento canônico do processo e neutraliza os demais com o
 * mesmo numero_pncp, na mesma transação. Valor, data e origem passam a ser do PNCP
 * juntos (o trecho e a confiança do valor anterior saem).
 */
function gravarResultadoPncp(documentoId, dados) {
  if (dados.valor_final === null || dados.valor_final === undefined) {
    throw new Error('gravarResultadoPncp: valor_final obrigatório (compra fechada e precificada)');
  }
  const id = Number(documentoId);
  const agora = new Date().toISOString();
  const numeroPncp = normalizarControlePncp(dados.numero_pncp);
  let changes = 0;
  db.exec('BEGIN');
  try {
    changes = db.prepare(SQL_GRAVAR_CANONICO).run({
      documento_id: id,
      vencedor_nome: dados.vencedor_cnpj ? dados.vencedor_nome || null : null,
      vencedor_cnpj: dados.vencedor_cnpj || null,
      multiplos: dados.multiplos_fornecedores ? 1 : 0,
      valor_final: dados.valor_final,
      numero_pncp: numeroPncp,
      data_homologacao: dados.data_resultado || null,
      origem: ORIGEM_PNCP,
      origem_detalhe: ORIGEM_DETALHE_RESULTADOS,
      agora,
    }).changes;
    if (numeroPncp) {
      db.prepare(SQL_NEUTRALIZAR_OUTROS).run({
        numero_pncp: numeroPncp,
        documento_id: id,
        origem: ORIGEM_PNCP,
        origem_detalhe: ORIGEM_DETALHE_NAO_CANONICO,
        agora,
      });
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  rodarGate(id);
  return changes || 0;
}

module.exports = {
  listarDocumentosPorNumeroPncp,
  gravarResultadoPncp,
  ORIGEM_DETALHE_RESULTADOS,
  ORIGEM_DETALHE_NAO_CANONICO,
};
