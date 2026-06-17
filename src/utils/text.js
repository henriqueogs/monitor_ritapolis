function decodeHttpBody(data, contentType = '', fallback = 'utf8') {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const normalizedType = String(contentType || '').toLowerCase();

  if (
    normalizedType.includes('charset=iso-8859-1') ||
    normalizedType.includes('charset=latin1') ||
    normalizedType.includes('charset=windows-1252')
  ) {
    return buffer.toString('latin1');
  }

  return buffer.toString(fallback);
}

function hasLoneSurrogate(str) {
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code >= 0xDC00 && code <= 0xDFFF) {
      if (i === 0 || str.charCodeAt(i - 1) < 0xD800 || str.charCodeAt(i - 1) > 0xDBFF) {return true;}
    } else if (code >= 0xD800 && code <= 0xDBFF) {
      if (i + 1 >= str.length || str.charCodeAt(i + 1) < 0xDC00 || str.charCodeAt(i + 1) > 0xDFFF) {return true;}
    }
  }
  return false;
}

function looksLikeMojibake(value) {
  return /Ã[\u00A0-\u00BF]|Â[\u00A0-\u00BF]|â[\u0080-\u00BF]{1,2}|ï¿½|�/.test(String(value || ''));
}

function countMojibakeIndicators(value) {
  return (
    String(value || '').match(/Ã[\u00A0-\u00BF]|Â[\u00A0-\u00BF]|â[\u0080-\u00BF]{1,2}|ï¿½|�/g) || []
  ).length;
}

function repairMojibake(value) {
  const text = String(value || '');

  if (!looksLikeMojibake(text)) {
    return text;
  }

  try {
    const repaired = Buffer.from(text, 'latin1').toString('utf8');
    return countMojibakeIndicators(repaired) < countMojibakeIndicators(text) ? repaired : text;
  } catch {
    return text;
  }
}

function normalizeText(value) {
  return repairMojibake(String(value || ''));
}

function deepRepairStrings(value) {
  if (typeof value === 'string') {
    return normalizeText(value);
  }

  if (Array.isArray(value)) {
    return value.map(deepRepairStrings);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [normalizeText(key), deepRepairStrings(nested)])
    );
  }

  return value;
}

function deepHasMojibake(value) {
  if (typeof value === 'string') {
    return looksLikeMojibake(value);
  }

  if (Array.isArray(value)) {
    return value.some(deepHasMojibake);
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).some(([key, nested]) => {
      return looksLikeMojibake(key) || deepHasMojibake(nested);
    });
  }

  return false;
}

function looksLikeMojibakeOrHasSurrogate(value) {
  const str = String(value || '');
  return looksLikeMojibake(str) || hasLoneSurrogate(str);
}

const LETRA = 'a-záéíóúàèìòùâêîôûãõçñ';
const VOGAL = 'aeiouáéíóúàèìòùâêîôûãõ';
// Palavra = letras, podendo ter hífen/apóstrofo INTERNO entre letras
// ("publique-se", "d'água"), mas não símbolos arbitrários no meio.
const RE_PALAVRA = new RegExp(`^[${LETRA}]+(?:['-][${LETRA}]+)*$`, 'i');
const RE_TEM_VOGAL = new RegExp(`[${VOGAL}]`, 'i');
const RE_LIMPAR_BORDAS = new RegExp(`^[^${LETRA}]+|[^${LETRA}]+$`, 'gi');

// Uma "palavra real" é um token que, removidas pontuações de borda, é alfabético
// (admite hífen/apóstrofo interno) com 3+ letras e ao menos uma vogal. Aceita
// "RESOLUÇÃO", "Almeida," (vírgula de borda), "Publique-se"; rejeita ruído de OCR
// com símbolos no MEIO ("tlLL#UL:;Ç", "&*1Jt!1:t:") ou sem vogal ("tlLL").
function isPalavraReal(token) {
  const core = String(token || '').replace(RE_LIMPAR_BORDAS, '');
  const letras = core.match(new RegExp(`[${LETRA}]`, 'gi')) || [];
  if (letras.length < 3) {
    return false;
  }
  // Um mesmo caractere repetido ("aaaa", "iii") não é palavra — exige variedade.
  if (new Set(letras.map((c) => c.toLowerCase())).size < 2) {
    return false;
  }
  return RE_PALAVRA.test(core) && RE_TEM_VOGAL.test(core);
}

// Um "número real" é um token numérico de verdade (valor, data, processo):
// começa e termina em dígito, só contém dígitos e separadores numéricos, e tem
// 2+ dígitos. Aceita "6.510.000,00", "15/03/2024", "36335-000"; rejeita ruído
// como ":t):11:t::tti" (dígitos colados em símbolos no meio).
function isNumeroReal(token) {
  const t = String(token || '');
  const core = t.replace(/^[^\d]+|[^\d]+$/g, '');
  if (!/^\d[\d.,:/-]*\d$/.test(core)) {
    return false;
  }
  if ((core.match(/\d/g) || []).length < 2) {
    return false;
  }
  // O núcleo numérico precisa dominar o token — rejeita dígitos perdidos em
  // ruído (":t):11:t::tti"), onde "11" é minoria entre símbolos.
  return core.length / t.length >= 0.6;
}

// Uma linha tem conteúdo de verdade quando contém ao menos uma palavra real ou
// um número real. Filtra ruído de OCR de cabeçalho/brasão ("a,r t B B !4tS r
// &*1Jt", "\\ tlLL#UL:;Ç tYÃw"), preservando linhas legítimas como "RESOLUÇÃO
// N. 01/2025" ou "VALOR: R$ 6.510.000,00".
function linhaTemConteudo(linha) {
  const tokens = String(linha || '').split(/\s+/).filter(Boolean);
  return tokens.some(isPalavraReal) || tokens.some(isNumeroReal);
}

// Remove de um texto OCR as linhas que são puro ruído (brasão/carimbo/logo que o
// OCR transformou em caracteres aleatórios), preservando todas as linhas com
// conteúdo real e a separação por linhas em branco. Conservador: só descarta a
// linha quando ela não tem NENHUMA palavra nem número real.
function limparRuidoOcr(texto) {
  if (!texto) {
    return '';
  }
  return String(texto)
    .split('\n')
    .filter((linha) => linha.trim() === '' || linhaTemConteudo(linha))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Resumo-truncagem para a coluna `documentos.resumo` (fallback de exibição):
// pula linhas-lixo iniciais (cabeçalho OCR) e pega os primeiros `max` chars do
// conteúdo real. Não substitui o resumo da IA, que é preferido na exibição.
function resumirTextoLimpo(texto, max = 280) {
  if (!texto) {
    return null;
  }
  const linhas = String(texto).split('\n');
  let i = 0;
  while (i < linhas.length && !linhaTemConteudo(linhas[i])) {
    i += 1;
  }
  const corpo = (i < linhas.length ? linhas.slice(i) : linhas)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return corpo.slice(0, max) || null;
}

module.exports = {
  decodeHttpBody,
  looksLikeMojibake: looksLikeMojibakeOrHasSurrogate,
  normalizeText,
  deepRepairStrings,
  deepHasMojibake,
  resumirTextoLimpo,
  isPalavraReal,
  isNumeroReal,
  linhaTemConteudo,
  limparRuidoOcr
};
