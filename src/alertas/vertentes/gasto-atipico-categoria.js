'use strict';

/**
 * Vertente "gasto atípico por categoria": adapta o detector puro existente ao contrato do
 * orquestrador. Contexto: { agregados, thresholds?, empenhosPorId: Map<id, despesa> }
 * (carregado pelo chamador; a vertente não toca o banco).
 */

const { detectarGastoAtipicoCategoria } = require('../detectores/gasto-atipico-categoria');
const { buildPortalDespesaLink } = require('../../transparencia/portal-links');

const MAX_EVIDENCIAS = 5;
const TRECHO_MAX = 160;
const PERCENTUAL = 100;
const MOEDA = 'R$';

function evidenciaDe(despesa) {
  const link = buildPortalDespesaLink({
    empenho: despesa.empenho,
    exercicio: despesa.exercicio_orcamento,
    tipo: despesa.tipo,
  });
  return {
    fonte_id: despesa.id,
    empenho_id: despesa.id,
    papel: 'evidencia',
    url_origem: link.url,
    portal_url: link.url,
    trecho: (despesa.historico || '').slice(0, TRECHO_MAX) || null,
    empenho: despesa.empenho,
    exercicio: despesa.exercicio_orcamento,
    valor: despesa.valor,
    portal_especifico: link.especifico,
  };
}

function tituloLegado(sinal) {
  if (sinal.tipo === 'gasto_atipico_credor') {
    return `${sinal.categoria}: um recebedor concentra ${Math.round(sinal.share * PERCENTUAL)}% da categoria em ${sinal.ano}`;
  }
  return `${sinal.categoria}: gasto deu um salto em ${sinal.ano}`;
}

function chaveLegada(sinal) {
  const base = `empenho|${sinal.categoria_slug}|${sinal.tipo}|${sinal.ano}`;
  return sinal.credor_cnpj ? `${base}|${sinal.credor_cnpj}` : base;
}

// Mantém tipo, chave e rótulos do runner antigo: o alerta existente é atualizado, não duplicado.
function camposLegados(sinal) {
  return {
    tipo: 'gasto_atipico',
    subcategoria: sinal.tipo,
    chave_unica: chaveLegada(sinal),
    valor_periodo_label: `Exercício ${sinal.ano}`,
    narrativa: `${sinal.motivo}. Valor atípico não significa irregularidade — pode ter explicação simples; os empenhos oficiais estão vinculados abaixo para conferência.`,
    confianca: 0.9,
    metadados: {
      categoria_slug: sinal.categoria_slug,
      credor_cnpj: sinal.credor_cnpj ?? null,
      credor_nome: sinal.credor_nome ?? null,
      share: sinal.share ?? null,
      total_categoria: sinal.total_categoria ?? null,
      valor_anterior: sinal.valor_anterior ?? null,
      unidade: 'R$',
    },
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
    titulo: tituloLegado(sinal),
    narrativa: sinal.motivo,
    alerta: camposLegados(sinal),
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
