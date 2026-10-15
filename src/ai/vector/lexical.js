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

function tokenizar(texto) {
  const normalizado = String(texto ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  return (normalizado.match(/[\p{L}\p{N}]+/gu) ?? []).filter(
    t => t.length >= TAMANHO_MINIMO && !STOPWORDS.has(t)
  );
}

/** Consulta FTS5: cada token entre aspas (nada da pergunta vira operador), unidos por OR. */
function montarMatchFts(consulta) {
  const tokens = [...new Set(tokenizar(consulta))];
  return tokens.length ? tokens.map(t => `"${t}"`).join(' OR ') : null;
}

module.exports = { tokenizar, montarMatchFts };
