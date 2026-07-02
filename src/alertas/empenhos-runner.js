'use strict';

/**
 * Runner de descobertas sobre empenhos (gasto atípico por categoria).
 * Fora do pipeline documento-cêntrico do alert-generator: empenho não tem
 * documento nem resumo IA. Evidências carregam deep-link do portal em
 * metadados (§11.3); idempotente por chave_unica.
 */

const logger = require('../logger');
const {
  getAgregadoCredorCategoriaAno,
  getDespesasPorIds,
} = require('../db/transparencia-agregados-repo');
const { classificarCategoria } = require('../transparencia/categorias');
const { buildPortalDespesaLink } = require('../transparencia/portal-links');
const { detectarGastoAtipicoCategoria } = require('./detectores/gasto-atipico-categoria');
const { getConfig, upsertAlerta } = require('../db/alertas-repo');

const MAX_EVIDENCIAS = 5;
const TRECHO_MAX = 160;

const DEFAULTS = {
  shareMinimo: 0.4,
  multiplicadorSalto: 3,
  valorMinimo: 50000,
  minCredoresCategoria: 4,
};

function lerThresholds() {
  return {
    shareMinimo: Number(getConfig('gasto_atipico.share_minimo', DEFAULTS.shareMinimo)),
    multiplicadorSalto: Number(getConfig('gasto_atipico.multiplicador_salto', DEFAULTS.multiplicadorSalto)),
    valorMinimo: Number(getConfig('gasto_atipico.valor_minimo', DEFAULTS.valorMinimo)),
    minCredoresCategoria: Number(
      getConfig('gasto_atipico.min_credores_categoria', DEFAULTS.minCredoresCategoria)
    ),
  };
}

function montarAgregadosClassificados() {
  return getAgregadoCredorCategoriaAno().map((row) => {
    const categoria = classificarCategoria(row.categoria_economica);
    return {
      slug: categoria.slug,
      rotulo: categoria.rotulo,
      ano: row.exercicio,
      credor_cnpj: row.credor_cnpj,
      credor_nome: row.credor_nome,
      n: row.n,
      valor_total: row.valor_total,
      empenho_ids: row.empenho_ids,
    };
  });
}

function montarEvidencias(sinal) {
  const despesas = getDespesasPorIds(sinal.empenho_ids.slice(0, MAX_EVIDENCIAS * 4)).slice(0, MAX_EVIDENCIAS);
  return despesas.map((d) => ({
    documento_id: null,
    papel: 'evidencia',
    trecho_fonte: (d.historico || '').slice(0, TRECHO_MAX) || null,
    metadados: {
      empenho_id: d.id,
      empenho: d.empenho,
      exercicio: d.exercicio_orcamento,
      valor: d.valor,
      credor_nome: d.credor_nome,
      portal_url: buildPortalDespesaLink({
        empenho: d.empenho,
        exercicio: d.exercicio_orcamento,
        tipo: d.tipo,
      }).url,
    },
  }));
}

function tituloDoSinal(sinal) {
  if (sinal.tipo === 'gasto_atipico_credor') {
    return `${sinal.categoria}: um recebedor concentra ${Math.round(sinal.share * 100)}% da categoria em ${sinal.ano}`;
  }
  return `${sinal.categoria}: gasto deu um salto em ${sinal.ano}`;
}

function chaveDoSinal(sinal) {
  const base = `empenho|${sinal.categoria_slug}|${sinal.tipo}|${sinal.ano}`;
  return sinal.credor_cnpj ? `${base}|${sinal.credor_cnpj}` : base;
}

function sinalParaAlerta(sinal) {
  return {
    tipo: 'gasto_atipico',
    categoria: sinal.categoria,
    subcategoria: sinal.tipo,
    severidade: sinal.severidade,
    titulo: tituloDoSinal(sinal),
    narrativa: `${sinal.motivo}. Valor atípico não significa irregularidade — pode ter explicação simples; os empenhos oficiais estão vinculados abaixo para conferência.`,
    metadados: {
      categoria_slug: sinal.categoria_slug,
      credor_cnpj: sinal.credor_cnpj ?? null,
      credor_nome: sinal.credor_nome ?? null,
      share: sinal.share ?? null,
      total_categoria: sinal.total_categoria ?? null,
      valor_anterior: sinal.valor_anterior ?? null,
      unidade: 'R$',
    },
    periodo_inicio: `${sinal.ano}-01-01`,
    periodo_fim: `${sinal.ano}-12-31`,
    valor_total: sinal.valor,
    valor_periodo_label: `Exercício ${sinal.ano}`,
    documentos_ids: [],
    questionamentos: [],
    confianca: 0.9,
    chave_unica: chaveDoSinal(sinal),
  };
}

function gerarDescobertasEmpenhos({ dryRun = false } = {}) {
  const thresholds = lerThresholds();
  const agregados = montarAgregadosClassificados();
  const sinais = detectarGastoAtipicoCategoria(agregados, thresholds);

  let gravados = 0;
  for (const sinal of sinais) {
    if (dryRun) {continue;}
    try {
      upsertAlerta(sinalParaAlerta(sinal), [], montarEvidencias(sinal));
      gravados += 1;
    } catch (err) {
      logger.error('empenhos-runner: falha ao gravar descoberta', {
        chave: chaveDoSinal(sinal),
        erro: err.message,
      });
    }
  }

  return { sinais: sinais.length, gravados, dryRun, thresholds };
}

module.exports = { gerarDescobertasEmpenhos };
