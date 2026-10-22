'use strict';

// Normaliza campos soltos da resposta da IA (datas, números, listas) antes do
// Zod: o modelo devolve "5 de março de 2024", "R$ 1.234,56" ou null no lugar
// de lista, e o contrato rejeitava o resumo inteiro (tarefa 25227, 22/10/2026).

const MESES = {
  janeiro: 1,
  fevereiro: 2,
  marco: 3,
  abril: 4,
  maio: 5,
  junho: 6,
  julho: 7,
  agosto: 8,
  setembro: 9,
  outubro: 10,
  novembro: 11,
  dezembro: 12,
};

const SEM_DATA = /^(null|n\/a|nao informado|sem data|nao consta|a definir)$/;

function semAcento(texto) {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function montarDataIso(ano, mes, dia) {
  const [a, m, d] = [Number(ano), Number(mes), Number(dia)];
  const data = new Date(Date.UTC(a, m - 1, d));
  const isValida =
    data.getUTCFullYear() === a && data.getUTCMonth() === m - 1 && data.getUTCDate() === d;
  if (!isValida) {
    return null;
  }
  return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// Data que não vira AAAA-MM-DD sai como null: o contrato aceita null e a
// descrição/trecho_fonte do item continuam guardando o que o texto disse.
function normalizeDateValue(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const text = semAcento(String(value).trim().toLowerCase());
  if (!text || SEM_DATA.test(text)) {
    return null;
  }

  const iso = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:t[\d:.]+z?)?$/);
  if (iso) {
    return montarDataIso(iso[1], iso[2], iso[3]);
  }

  const br = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (br) {
    return montarDataIso(br[3], br[2], br[1]);
  }

  const extenso = text.match(/^(\d{1,2})\s*[ºo°]?\s+de\s+([a-z]+)\s+de\s+(\d{4})$/);
  if (extenso && MESES[extenso[2]]) {
    return montarDataIso(extenso[3], MESES[extenso[2]], extenso[1]);
  }

  return null;
}

function normalizeNumberValue(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  const text = String(value)
    .replace(/[^\d,.-]/g, '')
    .trim();
  if (!/\d/.test(text)) {
    return null;
  }

  // "1.500.000" (milhar BR sem centavos) e "1.234,56" usam ponto como milhar.
  const isMilharComPonto = text.includes(',') || /^-?\d{1,3}(\.\d{3}){2,}$/.test(text);
  const normalized = isMilharComPonto ? text.replace(/\./g, '').replace(',', '.') : text;
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeListValue(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (value === null || value === undefined) {
    return [];
  }
  if (typeof value === 'string') {
    return value.trim() ? [value] : [];
  }
  return [value];
}

module.exports = {
  normalizeDateValue,
  normalizeNumberValue,
  normalizeListValue,
};
