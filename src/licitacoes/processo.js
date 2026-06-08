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
  if (digits.length >= 4) return digits;

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

module.exports = {
  normalizeProcessoChave,
  normalizeNumeroPncpChave,
  onlyDigits
};
