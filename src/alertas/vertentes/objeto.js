'use strict';

/**
 * Objeto de um empenho, a partir do histórico: chave interna (palavras significativas, sem
 * acento) para agrupar compras do mesmo tipo, e rótulo legível (com as palavras como foram
 * escritas) para o texto ao cidadão. Puro.
 */

const TOKENS_NO_OBJETO = 3;
const TAMANHO_MIN_TOKEN = 4;

const semAcento = texto => texto.normalize('NFD').replace(/[̀-ͯ]/g, '');

const PALAVRAS_VAZIAS = new Set([
  'para',
  'pela',
  'pelo',
  'como',
  'dessa',
  'desse',
  'municipal',
  'prefeitura',
  'municipio',
  'aquisicao',
  'compra',
  'fornecimento',
  'requisicao',
  'pagamento',
  'referente',
  'objeto',
  'conforme',
  'valor',
  'nota',
  'fiscal',
  'material',
  'materiais',
  'servico',
  'servicos',
  'processo',
  'despesa',
  'empenho',
  'empenha',
  'empenhado',
  'contratacao',
  'empresa',
  'destinado',
  'atender',
]);

function chaveDoObjeto(historico) {
  const tokens = semAcento(String(historico || '').toLowerCase())
    .split(/[^a-z]+/)
    .filter(t => t.length >= TAMANHO_MIN_TOKEN && !PALAVRAS_VAZIAS.has(t));
  return tokens.slice(0, TOKENS_NO_OBJETO).join(' ');
}

// A chave de objeto é interna (sem acento); o texto ao cidadão usa as palavras como foram
// escritas no histórico do empenho.
function rotuloDoObjeto(historico, chave) {
  const palavras = String(historico || '')
    .toLowerCase()
    .split(/[^\p{L}]+/u);
  return chave
    .split(' ')
    .map(token => palavras.find(p => semAcento(p) === token) || token)
    .join(' ');
}

module.exports = { chaveDoObjeto, rotuloDoObjeto };
