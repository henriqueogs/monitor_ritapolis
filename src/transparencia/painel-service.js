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

function montarPeriodo(exercicio, porAno) {
  const anos = (porAno || []).map((row) => Number(row.exercicio)).filter(Number.isInteger);
  const anosCobertos = anos.length ? [Math.min(...anos), Math.max(...anos)] : [];

  const ano = Number(exercicio);
  if (!Number.isInteger(ano) || ano <= 0) {
    return { exercicio: null, mandato: null, anos_cobertos: anosCobertos };
  }

  const inicio = mandatoInicio(ano);
  return {
    exercicio: ano,
    mandato: { inicio, fim: inicio + 3, label: mandatoLabel(inicio) },
    anos_cobertos: anosCobertos,
  };
}

function getPainelTransparencia({ exercicio } = {}) {
  const painel = getPainelResumo({ exercicio });
  return {
    ...painel,
    periodo: montarPeriodo(exercicio, painel.porAno),
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
