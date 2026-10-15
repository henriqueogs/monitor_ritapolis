'use strict';

/**
 * Service do dossiê de credor: perfil do repositório + agregação por mandato
 * + deep-links do portal em cada empenho recente.
 * O número em destaque é o do mandato em curso; o acumulado é secundário.
 */

const { getCredorProfile, listCredores, getCoberturaCredores } = require('../db/credores-repo');
const { agruparPorMandato, exerciciosDoMandato } = require('../utils/mandato');
const { comLinkPortal } = require('./portal-links');
const { montarDestaqueCredor, rotuloPeriodoLista } = require('./credor-destaque');

const CAMPOS_SOMA_MANDATO = ['n_empenhos', 'valor_total', 'valor_estimado_global'];

function getCredorDossie(cnpj, { anoAtual = new Date().getFullYear() } = {}) {
  const perfil = getCredorProfile(cnpj);
  if (!perfil) {return null;}

  const porMandato = agruparPorMandato(perfil.por_ano, {
    camposSoma: CAMPOS_SOMA_MANDATO,
    anoAtual,
  });

  return {
    ...perfil,
    por_mandato: porMandato,
    ...montarDestaqueCredor({ porAno: perfil.por_ano, porMandato, anoAtual }),
    empenhos_recentes: comLinkPortal(perfil.empenhos_recentes, { exercicioKey: 'ano' }),
  };
}

function resolverPeriodo({ exercicio, mandato }) {
  const ano = Number(exercicio);
  if (Number.isInteger(ano) && ano > 0) {
    return { tipo: 'exercicio', exercicio: ano };
  }
  const refMandato = Number(mandato);
  if (Number.isInteger(refMandato) && refMandato > 0) {
    return { tipo: 'mandato', exercicios: exerciciosDoMandato(refMandato) };
  }
  return { tipo: 'acumulado' };
}

/**
 * Lista credores de um período (exercício > mandato > acumulado) e devolve o
 * rótulo do período aplicado — a UI nunca exibe soma sem intervalo (§11.1).
 */
function listarCredoresDoPeriodo({ exercicio, mandato, ...filtros } = {}) {
  const periodo = resolverPeriodo({ exercicio, mandato });
  const resultado = listCredores({
    ...filtros,
    exercicio: periodo.exercicio,
    exercicios: periodo.exercicios,
  });
  const cobertura = periodo.tipo === 'acumulado' ? getCoberturaCredores() : undefined;

  return {
    ...resultado,
    periodo: {
      tipo: periodo.tipo,
      label: rotuloPeriodoLista({
        exercicio: periodo.exercicio,
        exercicios: periodo.exercicios,
        cobertura,
      }),
    },
  };
}

module.exports = { getCredorDossie, listarCredoresDoPeriodo };
