'use strict';

const { formatBRL } = require('../tipos');

/**
 * Detector puro de gasto atípico por categoria cidadã de empenho.
 * Recebe agregados por (categoria, ano, credor) e emite dois sinais:
 *  - gasto_atipico_credor: um credor concentra ≥ share mínimo do total da
 *    categoria no ano (mediana não funciona aqui — cauda longa faz todo
 *    fornecedor grande parecer "N× a mediana", validado em dado real)
 *  - gasto_atipico_salto:  total anual da categoria ≥ M× o do ano anterior
 * Piso absoluto de valor evita alarmar sobre quantias irrisórias (§ tom calmo).
 */

// Fluxos internos/obrigatórios — variação não é sinal de nada pro cidadão
const SLUGS_IGNORADOS = new Set(['extra-orcamentario', 'encargos', 'pessoal', 'divida']);

function agruparPor(lista, chaveFn) {
  const mapa = new Map();
  for (const item of lista) {
    const chave = chaveFn(item);
    if (!mapa.has(chave)) {mapa.set(chave, []);}
    mapa.get(chave).push(item);
  }
  return mapa;
}

function detectarCredoresConcentrados(agregados, { shareMinimo, valorMinimo, minCredoresCategoria }) {
  const sinais = [];
  for (const grupo of agruparPor(agregados, (a) => `${a.slug}|${a.ano}`).values()) {
    if (grupo.length < minCredoresCategoria) {continue;}
    const totalCategoria = grupo.reduce((s, c) => s + c.valor_total, 0);
    if (totalCategoria <= 0) {continue;}

    for (const c of grupo) {
      if (c.valor_total < valorMinimo) {continue;}
      const share = c.valor_total / totalCategoria;
      if (share < shareMinimo) {continue;}
      sinais.push({
        tipo: 'gasto_atipico_credor',
        categoria_slug: c.slug,
        categoria: c.rotulo,
        ano: c.ano,
        severidade: 'atencao',
        credor_cnpj: c.credor_cnpj,
        credor_nome: c.credor_nome,
        valor: c.valor_total,
        share,
        total_categoria: Math.round(totalCategoria * 100) / 100,
        n_empenhos: c.n,
        empenho_ids: c.empenho_ids || [],
        motivo:
          `${c.credor_nome} recebeu ${formatBRL(c.valor_total)} em ${c.rotulo.toLowerCase()} em ${c.ano} — ` +
          `${Math.round(share * 100)}% de tudo que a Prefeitura gastou com a categoria no ano ` +
          `(${formatBRL(totalCategoria)} entre ${grupo.length} recebedores)`,
      });
    }
  }
  return sinais;
}

function detectarSaltosAnuais(agregados, { multiplicadorSalto, valorMinimo }) {
  const sinais = [];
  for (const grupo of agruparPor(agregados, (a) => a.slug).values()) {
    const porAno = new Map();
    for (const c of grupo) {
      const atual = porAno.get(c.ano) || { valor: 0, empenho_ids: [] };
      atual.valor += c.valor_total;
      atual.empenho_ids.push(...(c.empenho_ids || []));
      porAno.set(c.ano, atual);
    }

    for (const [ano, atual] of porAno) {
      const anterior = porAno.get(ano - 1);
      if (!anterior || anterior.valor <= 0) {continue;}
      if (atual.valor < valorMinimo) {continue;}
      if (atual.valor < anterior.valor * multiplicadorSalto) {continue;}
      sinais.push({
        tipo: 'gasto_atipico_salto',
        categoria_slug: grupo[0].slug,
        categoria: grupo[0].rotulo,
        ano,
        severidade: 'atencao',
        valor: Math.round(atual.valor * 100) / 100,
        valor_anterior: Math.round(anterior.valor * 100) / 100,
        empenho_ids: atual.empenho_ids,
        motivo:
          `Gasto com ${grupo[0].rotulo.toLowerCase()} foi de ${formatBRL(anterior.valor)} em ${ano - 1} ` +
          `para ${formatBRL(atual.valor)} em ${ano} (${Math.round(atual.valor / anterior.valor)}×)`,
      });
    }
  }
  return sinais;
}

/**
 * @param {Array<{slug, rotulo, ano, credor_cnpj, credor_nome, n, valor_total, empenho_ids}>} agregados
 */
function detectarGastoAtipicoCategoria(
  agregados,
  { shareMinimo = 0.4, multiplicadorSalto = 3, valorMinimo = 50000, minCredoresCategoria = 4 } = {}
) {
  if (!Array.isArray(agregados) || !agregados.length) {return [];}
  const relevantes = agregados.filter((a) => a && !SLUGS_IGNORADOS.has(a.slug));
  if (!relevantes.length) {return [];}

  const opcoes = { shareMinimo, multiplicadorSalto, valorMinimo, minCredoresCategoria };
  return [...detectarCredoresConcentrados(relevantes, opcoes), ...detectarSaltosAnuais(relevantes, opcoes)];
}

module.exports = { detectarGastoAtipicoCategoria };
