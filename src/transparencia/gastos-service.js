'use strict';

/**
 * Service do painel "Pra onde vai o dinheiro": agrega despesas por categoria
 * cidadã, secretaria e fonte de recurso, sempre com período explícito.
 * Repo entrega agregados brutos; a reclassificação acontece aqui (DDD).
 */

const {
  getAgregadoPorCategoriaEconomica,
  getAgregadoPorUnidade,
  getAgregadoPorFonteRecurso,
  getRankingCredores,
  getCategoriaPorAno,
} = require('../db/transparencia-agregados-repo');
const { classificarCategoria, slugParaPrefixos, CATEGORIAS } = require('./categorias');
const { agruparPorMandato, mandatoInicio, mandatoLabel } = require('../utils/mandato');

const MANDATO_ANOS = 4;
const LIMITE_CREDORES = 15;

function resolverExercicios({ exercicio, mandato } = {}) {
  const ano = Number(exercicio);
  if (Number.isInteger(ano) && ano > 0) {return [ano];}

  const inicio = Number(mandato);
  if (Number.isInteger(inicio) && inicio > 0) {
    const base = mandatoInicio(inicio);
    return Array.from({ length: MANDATO_ANOS }, (_, i) => base + i);
  }
  return undefined;
}

function montarPeriodo({ exercicio, mandato }, serieAnual) {
  const anos = (serieAnual || []).map((r) => Number(r.exercicio)).filter(Number.isInteger);
  const anosCobertos = anos.length ? [Math.min(...anos), Math.max(...anos)] : [];

  const ano = Number(exercicio);
  if (Number.isInteger(ano) && ano > 0) {
    const inicio = mandatoInicio(ano);
    return {
      exercicio: ano,
      mandato: { inicio, fim: inicio + MANDATO_ANOS - 1, label: mandatoLabel(inicio) },
      anos_cobertos: anosCobertos,
    };
  }
  const inicioMandato = Number(mandato);
  if (Number.isInteger(inicioMandato) && inicioMandato > 0) {
    const inicio = mandatoInicio(inicioMandato);
    return {
      exercicio: null,
      mandato: { inicio, fim: inicio + MANDATO_ANOS - 1, label: mandatoLabel(inicio) },
      anos_cobertos: anosCobertos,
    };
  }
  return { exercicio: null, mandato: null, anos_cobertos: anosCobertos };
}

function reclassificarPorSlug(rowsBrutas) {
  const porSlug = new Map();
  for (const row of rowsBrutas) {
    const cat = classificarCategoria(row.categoria_economica);
    const atual = porSlug.get(cat.slug) || { ...cat, n_empenhos: 0, valor_total: 0 };
    atual.n_empenhos += row.n;
    atual.valor_total += row.valor_total || 0;
    porSlug.set(cat.slug, atual);
  }
  return [...porSlug.values()]
    .map((c) => ({ ...c, valor_total: Math.round(c.valor_total * 100) / 100 }))
    .sort((a, b) => b.valor_total - a.valor_total);
}

function getGastosPanorama({ exercicio, mandato } = {}) {
  const exercicios = resolverExercicios({ exercicio, mandato });
  const serieTotal = getCategoriaPorAno({});

  return {
    periodo: montarPeriodo({ exercicio, mandato }, serieTotal),
    por_mandato: agruparPorMandato(serieTotal, {
      anoKey: 'exercicio',
      camposSoma: ['n', 'valor_total'],
    }),
    categorias: reclassificarPorSlug(getAgregadoPorCategoriaEconomica({ exercicios })),
    por_unidade: getAgregadoPorUnidade({ exercicios }),
    por_fonte: getAgregadoPorFonteRecurso({ exercicios }),
  };
}

function getCategoriaDossie(slug, { exercicio, mandato } = {}) {
  const meta = CATEGORIAS.find((c) => c.slug === slug);
  if (!meta) {return null;}

  const prefixos = slugParaPrefixos(slug);
  const exercicios = resolverExercicios({ exercicio, mandato });
  const porAno = getCategoriaPorAno({ prefixos });

  return {
    categoria: { slug: meta.slug, rotulo: meta.rotulo, grupo: meta.grupo },
    periodo: montarPeriodo({ exercicio, mandato }, porAno),
    por_ano: porAno,
    por_mandato: agruparPorMandato(porAno, { anoKey: 'exercicio', camposSoma: ['n', 'valor_total'] }),
    top_credores: getRankingCredores({ prefixos, exercicios, limite: LIMITE_CREDORES }),
    por_unidade: getAgregadoPorUnidade({ exercicios, prefixos }),
    por_fonte: getAgregadoPorFonteRecurso({ exercicios, prefixos }),
  };
}

module.exports = { getGastosPanorama, getCategoriaDossie };
