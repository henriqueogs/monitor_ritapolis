'use strict';

/**
 * Classificação do tipo de valor final de um item de resultado de licitação
 * (unitário, total do item, lote ou global). Regra central: sinal de LOTE ou
 * GLOBAL — vindo do parser, do número do lote ou de qualquer trecho da fonte —
 * VENCE a existência de quantidade. Foi a inversão dessa precedência que fez
 * valor de lote virar unitário e ser multiplicado pela quantidade
 * (R$ 4.815.000 × 8 = R$ 38,5M no documento 5).
 */

const VALOR_FINAL_TIPO = {
  UNITARIO: 'unitario',
  TOTAL_ITEM: 'total_item',
  LOTE: 'lote',
  GLOBAL: 'global',
};

const LOTE_NUMERO_RE = /\blote\s*(?:n[ºo°.]?\s*)?0*(\d{1,4})\b/i;
const SERVICO_OBRA_RE =
  /\b(servico|servicos|prestacao|obra|reforma|construcao|ampliacao|engenharia|manutencao)\b/;
const VALOR_MINIMO_HEURISTICA_GLOBAL = 1000;

function normalizarTexto(value) {
  if (!value) {return '';}
  return String(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/**
 * @returns {'lote'|'global'|null}
 */
function detectarTipoValorEmTexto(texto) {
  const key = normalizarTexto(texto);
  if (!key) {return null;}
  if (/\bvalor global\b|\bglobal\b/.test(key)) {return VALOR_FINAL_TIPO.GLOBAL;}
  if (/\blote\b/.test(key)) {return VALOR_FINAL_TIPO.LOTE;}
  return null;
}

/**
 * "LOTE 00008" → '8'. @returns {string|null}
 */
function extrairLoteNumero(texto) {
  const match = String(texto || '').match(LOTE_NUMERO_RE);
  return match ? String(Number(match[1])) : null;
}

/**
 * @param {{ tipoParser?: string, loteNumero?: string, trechos?: string[],
 *           quantidade?: number, valorFinal?: number }} sinais
 * @returns {'unitario'|'total_item'|'lote'|'global'}
 */
function inferirValorFinalTipoResultado({
  tipoParser,
  loteNumero,
  trechos = [],
  quantidade,
  valorFinal,
} = {}) {
  // 1. Tipo explícito do parser (lote/global/total) vence tudo
  if (
    tipoParser === VALOR_FINAL_TIPO.LOTE ||
    tipoParser === VALOR_FINAL_TIPO.GLOBAL ||
    tipoParser === VALOR_FINAL_TIPO.TOTAL_ITEM
  ) {
    return tipoParser;
  }

  // 2. Número de lote conhecido
  if (loteNumero) {return VALOR_FINAL_TIPO.LOTE;}

  // 3. Sinal textual em qualquer trecho da fonte
  for (const trecho of trechos) {
    const detectado = detectarTipoValorEmTexto(trecho);
    if (detectado) {return detectado;}
  }

  // 4. Só agora a quantidade decide unitário
  if (quantidade) {return VALOR_FINAL_TIPO.UNITARIO;}

  // 5. Heurística: serviço/obra sem quantidade com valor relevante = global
  const key = normalizarTexto(trechos.filter(Boolean).join(' '));
  if (SERVICO_OBRA_RE.test(key) && Number(valorFinal || 0) >= VALOR_MINIMO_HEURISTICA_GLOBAL) {
    return VALOR_FINAL_TIPO.GLOBAL;
  }

  return VALOR_FINAL_TIPO.UNITARIO;
}

module.exports = {
  VALOR_FINAL_TIPO,
  detectarTipoValorEmTexto,
  extrairLoteNumero,
  inferirValorFinalTipoResultado,
};
