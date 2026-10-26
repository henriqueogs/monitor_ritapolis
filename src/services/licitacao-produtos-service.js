'use strict';

/**
 * Itens/resultado de uma licitação para a tela do documento, com o vencedor
 * marcado quando há perfil de credor (evita link /credores/:cnpj que dá 404).
 */

const { getLicitacaoProdutosByDocumentoId } = require('../db/produtos-repo');
const { credorTemPerfil } = require('../db/credores-repo');
const { marcarPerfilFornecedores } = require('../licitacoes/itens-processo-view');

function getLicitacaoProdutosComPerfil(documentoId) {
  const resultado = getLicitacaoProdutosByDocumentoId(documentoId);
  if (!resultado?.estrutura) {return resultado;}
  return { ...resultado, estrutura: marcarPerfilFornecedores(resultado.estrutura, credorTemPerfil) };
}

module.exports = { getLicitacaoProdutosComPerfil };
