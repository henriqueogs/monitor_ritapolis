const { normalizeText } = require('../utils/text');

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeProcessoChave(value) {
  const text = normalizeText(String(value || ''))
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const digits = onlyDigits(text);
  if (digits.length >= 4) {return digits;}

  return text.replace(/\s+/g, '') || null;
}

function normalizeNumeroPncpChave(value) {
  const text = normalizeText(String(value || ''))
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '');

  return text || null;
}

// Limpeza do campo `numero` extraído de títulos — remove pontuação solta nas
// bordas ("011/2016." → "011/2016") preservando separadores internos.
function normalizarNumeroDocumento(value) {
  const limpo = String(value || '')
    .trim()
    .replace(/^[\s.,;:\-–]+/, '')
    .replace(/[\s.,;:\-–]+$/, '');

  if (!limpo || !/\d/.test(limpo)) {return null;}
  return limpo;
}

function tokensTitulo(value) {
  return normalizeText(String(value || ''))
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9/]+/)
    .filter(Boolean);
}

// Similaridade Jaccard entre os conjuntos de tokens de dois títulos (0–1).
function similaridadeTitulos(a, b) {
  const setA = new Set(tokensTitulo(a));
  const setB = new Set(tokensTitulo(b));
  if (setA.size === 0 || setB.size === 0) {return 0;}

  let intersecao = 0;
  for (const token of setA) {
    if (setB.has(token)) {intersecao += 1;}
  }

  return intersecao / (setA.size + setB.size - intersecao);
}

// Referências numéricas tipo NNN/YYYY do título, com zeros à esquerda
// normalizados ("006/2020" ≡ "06/2020").
function refsNumericas(value) {
  const matches = String(value || '').match(/\d{1,5}\s*\/\s*\d{2,4}/g) || [];
  return new Set(
    matches.map((ref) => {
      const [num, ano] = ref.replace(/\s+/g, '').split('/');
      return `${Number(num)}/${ano}`;
    })
  );
}

const SIMILARIDADE_MINIMA_TITULOS = 0.5;

/**
 * Decide se dois títulos podem se referir ao MESMO documento — impede que o
 * fallback de identidade (numero+ano+tipo) una processos distintos que dividem
 * o mesmo número. Regras:
 *  1. Sem um dos títulos: compatível (sem evidência contra).
 *  2. Refs numéricas presentes em ambos e disjuntas → incompatível
 *     (ex.: Aditamento Contrato 072/2016 vs 074/2016).
 *  3. Caso contrário, exige similaridade Jaccard ≥ 0.5.
 */
function titulosCompativeis(a, b) {
  if (!a || !b) {return true;}

  const refsA = refsNumericas(a);
  const refsB = refsNumericas(b);
  if (refsA.size > 0 && refsB.size > 0) {
    const temInterseccao = [...refsA].some((ref) => refsB.has(ref));
    if (!temInterseccao) {return false;}
  }

  return similaridadeTitulos(a, b) >= SIMILARIDADE_MINIMA_TITULOS;
}

module.exports = {
  normalizeProcessoChave,
  normalizeNumeroPncpChave,
  onlyDigits,
  normalizarNumeroDocumento,
  similaridadeTitulos,
  titulosCompativeis
};
