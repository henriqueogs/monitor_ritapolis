'use strict';

/** Tokenização lexical compartilhada pelos stores: perguntas viram consultas FTS5 seguras. */

const STOPWORDS = new Set(
  [
    'de', 'da', 'do', 'das', 'dos', 'em', 'no', 'na', 'nos', 'nas', 'um', 'uma', 'uns', 'umas',
    'o', 'os', 'as', 'ao', 'aos', 'por', 'para', 'com', 'sem', 'sob', 'que', 'qual', 'quais',
    'quem', 'quanto', 'quantos', 'quando', 'onde', 'como', 'foi', 'foram', 'ser', 'sao', 'e',
    'ou', 'se', 'ha', 'pelo', 'pela', 'pelos', 'pelas',
  ] // prettier-ignore
);
const TAMANHO_MINIMO = 2;

const normalizar = texto =>
  String(texto ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

/** Tokens do texto como o FTS5 os vê (sem descartar curtos nem stopwords): serve para checar adjacência. */
const tokensBrutos = texto => normalizar(texto).match(/[\p{L}\p{N}]+/gu) ?? [];

function tokenizar(texto) {
  return tokensBrutos(texto).filter(t => t.length >= TAMANHO_MINIMO && !STOPWORDS.has(t));
}

// Número de documento "N/AAAA" (ex.: 3/2025, 034/2026). Não pega data (10/03/2025), valor nem ano solto.
const NUMERO_DOCUMENTO = /(?<![\p{L}\p{N}/.,])(\d{1,6})\s*\/\s*(\d{4})(?![\p{L}\p{N}/])/gu;
const LARGURAS_NUMERO = [3, 4, 6]; // 034/2026, 0034/2026 e o 000034/2026 do PNCP
const MAX_IDENTIFICADORES = 3;

/**
 * Identificadores de documento da pergunta como sequências de tokens ([numero, ano]), com variantes de
 * zeros à esquerda. O tokenizador descarta "3" (1 caractere) e deixa o número do documento invisível;
 * como FRASE (tokens adjacentes) ele volta a ser um critério forte: "decreto nº 3/2025" acha o 3/2025.
 */
function identificadoresDocumento(consulta) {
  const achados = [...normalizar(consulta).matchAll(NUMERO_DOCUMENTO)].slice(
    0,
    MAX_IDENTIFICADORES
  );
  const sequencias = new Map();
  for (const [, numero, ano] of achados) {
    const semZeros = numero.replace(/^0+/, '') || '0';
    const variantes = new Set([
      numero,
      semZeros,
      ...LARGURAS_NUMERO.map(l => semZeros.padStart(l, '0')),
    ]);
    variantes.forEach(v => sequencias.set(v + '|' + ano, [v, ano]));
  }
  return [...sequencias.values()];
}

/** true se "sequencia" aparece em "tokens" como tokens consecutivos e na ordem. */
function contemSequencia(tokens, sequencia) {
  if (!sequencia.length) {
    return false;
  }
  for (let i = 0; i + sequencia.length <= tokens.length; i += 1) {
    if (sequencia.every((t, j) => tokens[i + j] === t)) {
      return true;
    }
  }
  return false;
}

/**
 * Consulta FTS5: cada token entre aspas (nada da pergunta vira operador), unidos por OR; cada
 * identificador de documento entra também como frase entre aspas.
 */
function montarMatchFts(consulta) {
  const termos = [...new Set(tokenizar(consulta))].map(t => '"' + t + '"');
  const frases = identificadoresDocumento(consulta).map(
    sequencia => '"' + sequencia.join(' ') + '"'
  );
  const todos = [...termos, ...frases];
  return todos.length ? todos.join(' OR ') : null;
}

module.exports = {
  tokenizar,
  tokensBrutos,
  montarMatchFts,
  identificadoresDocumento,
  contemSequencia,
};
