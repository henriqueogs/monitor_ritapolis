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

module.exports = {
  decodeHttpBody,
  looksLikeMojibake,
  normalizeText,
  deepRepairStrings,
  deepHasMojibake
};
