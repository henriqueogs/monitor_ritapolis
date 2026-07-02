'use strict';

/**
 * Convenção de mandato municipal (eleições a cada 4 anos, referência 2025).
 * Fonte única — scripts e services devem importar daqui em vez de redefinir.
 */

const MANDATO_REFERENCIA = 2025;
const MANDATO_DURACAO_ANOS = 4;
const ANO_PLAUSIVEL_MIN = 1990;
const ANO_PLAUSIVEL_MAX = 2100;

function mandatoInicio(ano) {
  const n = Number(ano);
  return (
    MANDATO_REFERENCIA +
    Math.floor((n - MANDATO_REFERENCIA) / MANDATO_DURACAO_ANOS) * MANDATO_DURACAO_ANOS
  );
}

function mandatoLabel(inicio) {
  return `${inicio}-${inicio + MANDATO_DURACAO_ANOS - 1}`;
}

/**
 * Agrupa linhas anuais por mandato, somando campos indicados.
 * Expõe `anos` reais presentes nos dados para a UI rotular mandatos parciais.
 * @param {Array<object>} rows
 * @param {{ anoKey?: string, camposSoma?: string[], anoAtual?: number }} opcoes
 * @returns {Array<{ mandato: string, inicio: number, fim: number, anos: number[], em_curso: boolean }>}
 */
function agruparPorMandato(rows, { anoKey = 'ano', camposSoma = [], anoAtual } = {}) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const anoCorrente = Number.isFinite(anoAtual) ? anoAtual : new Date().getFullYear();

  const porMandato = new Map();
  for (const row of rows) {
    const ano = Number(row?.[anoKey]);
    if (!Number.isInteger(ano) || ano < ANO_PLAUSIVEL_MIN || ano > ANO_PLAUSIVEL_MAX) continue;

    const inicio = mandatoInicio(ano);
    const key = mandatoLabel(inicio);
    const grupo = porMandato.get(key) || {
      mandato: key,
      inicio,
      fim: inicio + MANDATO_DURACAO_ANOS - 1,
      anos: [],
      em_curso: anoCorrente >= inicio && anoCorrente <= inicio + MANDATO_DURACAO_ANOS - 1,
      ...Object.fromEntries(camposSoma.map((campo) => [campo, 0])),
    };

    grupo.anos.push(ano);
    for (const campo of camposSoma) {
      grupo[campo] += Number(row[campo]) || 0;
    }
    porMandato.set(key, grupo);
  }

  return [...porMandato.values()]
    .sort((a, b) => b.inicio - a.inicio)
    .map((grupo) => ({ ...grupo, anos: grupo.anos.sort((a, b) => a - b) }));
}

module.exports = {
  mandatoInicio,
  mandatoLabel,
  agruparPorMandato,
};
