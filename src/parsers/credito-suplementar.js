'use strict';

/**
 * Lê decretos de abertura de crédito suplementar (texto de OCR, com erros como "R§", "RS" e
 * "1 .518,00"): valor total aberto e a fonte do recurso indicada no artigo 2º. Puro.
 *   fonte: 'anulacao' | 'superavit' | 'excesso' | 'misto' | null (trecho ilegível ou ausente)
 */

const JANELA_RECURSOS = 600;
const CENTAVOS = 100;

const VALOR_TOTAL =
  /Cr[ée]dito\s*Suplementar\s*no\s*valor\s*total\s*de\s*R\s*[$S§5]?\s*([\d.\s]+,\s?\d{2})/i;
const RECURSOS = /Como\s+recursos/i;
// Cada fonte tem variações de OCR ("anrúaçáo", "frca utilizado"): o radical é o que se repete.
const FONTES = {
  anulacao: /anulad|anula[cç]|anr\S{0,3}a[cç]/i,
  superavit: /super[aá]vit/i,
  excesso: /excesso\s+de\s+a/i,
};

function parseValor(texto) {
  const m = String(texto ?? '')
    .replace(/\s+/g, ' ')
    .match(VALOR_TOTAL);
  if (!m) {
    return null;
  }
  const numero = Number(m[1].replace(/[\s.]/g, '').replace(',', '.'));
  return Number.isFinite(numero) ? Math.round(numero * CENTAVOS) / CENTAVOS : null;
}

function parseFonte(texto) {
  const t = String(texto ?? '').replace(/\s+/g, ' ');
  const inicio = t.search(RECURSOS);
  if (inicio < 0) {
    return null;
  }
  const janela = t.slice(inicio, inicio + JANELA_RECURSOS);
  const achadas = Object.entries(FONTES)
    .filter(([, regex]) => regex.test(janela))
    .map(([nome]) => nome);
  if (achadas.length === 0) {
    return null;
  }
  return achadas.length === 1 ? achadas[0] : 'misto';
}

function parseCreditoSuplementar(texto) {
  return { valorTotal: parseValor(texto), fonte: parseFonte(texto) };
}

module.exports = { parseCreditoSuplementar };
