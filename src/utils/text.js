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
      if (i === 0 || str.charCodeAt(i - 1) < 0xD800 || str.charCodeAt(i - 1) > 0xDBFF) return true;
    } else if (code >= 0xD800 && code <= 0xDBFF) {
      if (i + 1 >= str.length || str.charCodeAt(i + 1) < 0xDC00 || str.charCodeAt(i + 1) > 0xDFFF) return true;
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

module.exports = {
  decodeHttpBody,
  looksLikeMojibake: looksLikeMojibakeOrHasSurrogate,
  normalizeText,
  deepRepairStrings,
  deepHasMojibake
};
