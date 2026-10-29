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
const vertente = require('./vertentes/gasto-atipico-categoria');
const { rodarVertentes } = require('./vertentes/orquestrador');
const { persistirCandidatos } = require('./vertentes/persistencia');
const { getConfig, upsertAlerta } = require('../db/alertas-repo');

const DEFAULTS = {
  shareMinimo: 0.4,
  multiplicadorSalto: 3,
  valorMinimo: 50000,
  minCredoresCategoria: 4,
};

function lerThresholds() {
  return {
    shareMinimo: Number(getConfig('gasto_atipico.share_minimo', DEFAULTS.shareMinimo)),
    multiplicadorSalto: Number(
      getConfig('gasto_atipico.multiplicador_salto', DEFAULTS.multiplicadorSalto)
    ),
    valorMinimo: Number(getConfig('gasto_atipico.valor_minimo', DEFAULTS.valorMinimo)),
    minCredoresCategoria: Number(
      getConfig('gasto_atipico.min_credores_categoria', DEFAULTS.minCredoresCategoria)
    ),
  };
}

function montarAgregadosClassificados() {
  return getAgregadoCredorCategoriaAno().map(row => {
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

function empenhosDosAgregados(agregados) {
  const ids = [...new Set(agregados.flatMap(a => a.empenho_ids || []))];
  return new Map(getDespesasPorIds(ids).map(d => [d.id, d]));
}

function gerarDescobertasEmpenhos({ dryRun = false } = {}) {
  const thresholds = lerThresholds();
  const agregados = montarAgregadosClassificados();
  const { candidatos, resumo } = rodarVertentes(
    { agregados, thresholds, empenhosPorId: empenhosDosAgregados(agregados) },
    [vertente]
  );
  const info = resumo[vertente.nome];
  if (info.erro) {
    logger.error('empenhos-runner: vertente falhou', { erro: info.erro });
  }
  const { gravados } = persistirCandidatos(candidatos, { upsert: upsertAlerta, dryRun });
  return { sinais: candidatos.length, gravados, dryRun, thresholds };
}

module.exports = { gerarDescobertasEmpenhos };
