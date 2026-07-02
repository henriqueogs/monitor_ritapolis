'use strict';

/**
 * Service do painel de transparência: compõe o resumo do repositório com a
 * convenção de mandato e os deep-links do portal da fonte. Rotas HTTP delegam
 * aqui — nenhuma agregação de negócio fica em server.js.
 */

const {
  getPainelResumo,
  getDespesas,
  getDespesasPorDocumento,
} = require('../db/transparencia-repo');
const { agruparPorMandato, mandatoInicio, mandatoLabel } = require('../utils/mandato');
const { comLinkPortal } = require('./portal-links');

const CAMPOS_SOMA_MANDATO = ['n_empenhos', 'valor_total', 'n_empenhos_vinculados', 'valor_receita_previsto'];

const MANDATO_ANOS = 4;

function descreverMandato(inicio) {
  return { inicio, fim: inicio + MANDATO_ANOS - 1, label: mandatoLabel(inicio) };
}

function montarPeriodo({ exercicio, mandato }, porAno) {
  const anos = (porAno || []).map((row) => Number(row.exercicio)).filter(Number.isInteger);
  const anosCobertos = anos.length ? [Math.min(...anos), Math.max(...anos)] : [];

  const anoFiltro = Number(exercicio);
  if (Number.isInteger(anoFiltro) && anoFiltro > 0) {
    return {
      exercicio: anoFiltro,
      mandato: descreverMandato(mandatoInicio(anoFiltro)),
      anos_cobertos: anosCobertos,
    };
  }

  const inicioMandato = Number(mandato);
  if (Number.isInteger(inicioMandato) && inicioMandato > 0) {
    return {
      exercicio: null,
      mandato: descreverMandato(mandatoInicio(inicioMandato)),
      anos_cobertos: anosCobertos,
    };
  }

  return { exercicio: null, mandato: null, anos_cobertos: anosCobertos };
}

/**
 * @param {{ exercicio?: number, mandato?: number }} filtro — `mandato` é o ano
 * de início do mandato; escopa pelos 4 exercícios correspondentes.
 */
function getPainelTransparencia({ exercicio, mandato } = {}) {
  const inicioMandato = Number(mandato);
  const filtroRepo =
    Number.isInteger(inicioMandato) && inicioMandato > 0 && !exercicio
      ? {
          exercicios: Array.from({ length: MANDATO_ANOS }, (_, i) => mandatoInicio(inicioMandato) + i),
        }
      : { exercicio };

  const painel = getPainelResumo(filtroRepo);
  return {
    ...painel,
    periodo: montarPeriodo({ exercicio, mandato }, painel.porAno),
    porMandato: agruparPorMandato(painel.porAno, {
      anoKey: 'exercicio',
      camposSoma: CAMPOS_SOMA_MANDATO,
    }),
    ultimosEmpenhos: comLinkPortal(painel.ultimosEmpenhos),
  };
}

function getDespesasComPortal(filtros = {}) {
  const resultado = getDespesas(filtros);
  return { ...resultado, dados: comLinkPortal(resultado.dados) };
}

function getDespesasDocumentoComPortal(documentoId) {
  return comLinkPortal(getDespesasPorDocumento(documentoId));
}

module.exports = {
  getPainelTransparencia,
  getDespesasComPortal,
  getDespesasDocumentoComPortal,
};
