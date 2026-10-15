'use strict';

/**
 * Destaque do dossiê de credor: o número principal é o do MANDATO EM CURSO;
 * o acumulado de todos os mandatos é apenas um somador secundário, rotulado
 * com o intervalo (CLAUDE.md §11.1; fiscal-datas D3).
 */

const { mandatoInicio, mandatoLabel, MANDATO_DURACAO_ANOS } = require('../utils/mandato');

function rotuloIntervalo(primeiro, ultimo) {
  if (!Number.isInteger(primeiro) || !Number.isInteger(ultimo)) {return null;}
  return primeiro === ultimo ? String(primeiro) : `${primeiro}–${ultimo}`;
}

function montarDestaque(porMandato, anoAtual) {
  const emCurso = porMandato.find((m) => m.em_curso);
  if (emCurso) {
    return {
      mandato: emCurso.mandato,
      inicio: emCurso.inicio,
      fim: emCurso.fim,
      anos: emCurso.anos,
      valor_total: emCurso.valor_total,
      n_empenhos: emCurso.n_empenhos,
      em_curso: true,
    };
  }
  const inicio = mandatoInicio(anoAtual);
  return {
    mandato: mandatoLabel(inicio),
    inicio,
    fim: inicio + MANDATO_DURACAO_ANOS - 1,
    anos: [],
    valor_total: 0,
    n_empenhos: 0,
    em_curso: true,
  };
}

function montarAcumulado(porAno, porMandato) {
  if (!porAno.length) {return null;}
  const anos = porAno.map((r) => Number(r.ano));
  return {
    label: rotuloIntervalo(Math.min(...anos), Math.max(...anos)),
    valor_total: porMandato.reduce((acc, m) => acc + m.valor_total, 0),
    n_empenhos: porMandato.reduce((acc, m) => acc + m.n_empenhos, 0),
  };
}

/**
 * @param {{ porAno: Array, porMandato: Array, anoAtual?: number }} dados
 */
function montarDestaqueCredor({ porAno = [], porMandato = [], anoAtual = new Date().getFullYear() } = {}) {
  return {
    destaque: montarDestaque(porMandato, anoAtual),
    acumulado: montarAcumulado(porAno, porMandato),
  };
}

/**
 * Rótulo do período efetivamente aplicado numa listagem (nunca inventa período).
 * @param {{ exercicio?: number, exercicios?: number[], cobertura?: { primeiro, ultimo } }} periodo
 */
function rotuloPeriodoLista({ exercicio, exercicios, cobertura } = {}) {
  if (Number.isInteger(Number(exercicio)) && Number(exercicio) > 0) {return String(Number(exercicio));}
  if (Array.isArray(exercicios) && exercicios.length) {
    return rotuloIntervalo(Math.min(...exercicios), Math.max(...exercicios));
  }
  if (cobertura) {return rotuloIntervalo(cobertura.primeiro, cobertura.ultimo);}
  return null;
}

module.exports = { montarDestaqueCredor, rotuloPeriodoLista };
