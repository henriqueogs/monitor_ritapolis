'use strict';

/**
 * Vertente "gasto atípico por categoria": adapta o detector puro existente ao contrato do
 * orquestrador. Contexto: { agregados, thresholds?, empenhosPorId: Map<id, despesa> }
 * (carregado pelo chamador; a vertente não toca o banco).
 */

const { detectarGastoAtipicoCategoria } = require('../detectores/gasto-atipico-categoria');
const { buildPortalDespesaLink } = require('../../transparencia/portal-links');

const MAX_EVIDENCIAS = 10;
const TRECHO_MAX = 200;
const MOEDA = 'R$';

function evidenciaDe(despesa) {
  const link = buildPortalDespesaLink({
    empenho: despesa.empenho,
    exercicio: despesa.exercicio_orcamento,
    tipo: despesa.tipo,
  });
  return {
    fonte_id: despesa.id,
    papel: 'empenho',
    url_origem: link.url,
    trecho: (despesa.historico || '').slice(0, TRECHO_MAX) || null,
    empenho: despesa.empenho,
    exercicio: despesa.exercicio_orcamento,
    valor: despesa.valor,
    portal_especifico: link.especifico,
  };
}

function sinalParaCandidato(sinal, empenhosPorId) {
  const evidencias = (sinal.empenho_ids || [])
    .map(id => empenhosPorId.get(id))
    .filter(Boolean)
    .slice(0, MAX_EVIDENCIAS)
    .map(evidenciaDe);
  return {
    objeto: sinal.credor_nome
      ? `${sinal.categoria} — ${sinal.credor_nome}`
      : `${sinal.categoria} — salto anual`,
    titulo: sinal.motivo,
    narrativa: sinal.motivo,
    categoria: sinal.categoria,
    metrica: {
      nome: sinal.tipo,
      unidade: MOEDA,
      valor: sinal.valor,
      ...(sinal.share === undefined ? {} : { share: sinal.share }),
      ...(sinal.valor_anterior === undefined ? {} : { valor_anterior: sinal.valor_anterior }),
    },
    evidencias,
    periodo: { ano: sinal.ano },
    severidade: sinal.severidade,
  };
}

function detectar({ agregados = [], thresholds = {}, empenhosPorId = new Map() } = {}) {
  return detectarGastoAtipicoCategoria(agregados, thresholds).map(sinal =>
    sinalParaCandidato(sinal, empenhosPorId)
  );
}

module.exports = {
  nome: 'gasto-atipico-categoria',
  versao: 1,
  criterio:
    'Um credor concentra grande parte do gasto da categoria no ano, ou o total anual da categoria salta em relação ao ano anterior.',
  detectar,
};
