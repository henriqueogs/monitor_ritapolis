'use strict';

// CommonJS de propósito (mesmo padrão de lib/ente.js): testável pelo Jest da raiz.
//
// Rótulo do período exibido ao cidadão (§11.1). Mandato em curso mostra os anos
// com dado de fato (2025–2026), nunca o mandato inteiro (2025–2028), para a home
// e /transparencia dizerem o mesmo sobre o mesmo número.

function intervalo(min, max) {
  if (!min || !max) return null;
  return min === max ? String(min) : `${min}–${max}`;
}

function montarPeriodoLabel(modo, periodo, porMandato) {
  if (!periodo) return 'período coletado';
  if (modo === 'exercicio') return String(periodo.exercicio);
  if (modo === 'mandato' && periodo.mandato) {
    const grupo = (porMandato || []).find((m) => m.inicio === periodo.mandato.inicio);
    const anos = grupo?.anos || [];
    if (anos.length) return intervalo(Math.min(...anos), Math.max(...anos));
    return intervalo(periodo.mandato.inicio, periodo.mandato.fim);
  }
  const [min, max] = periodo.anos_cobertos || [];
  return intervalo(min, max) || 'período coletado';
}

module.exports = { montarPeriodoLabel };
