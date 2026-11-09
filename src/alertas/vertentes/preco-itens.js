'use strict';

/**
 * Vertente "preço acima da referência": mesmo código de produto e mesma unidade em vários
 * empenhos, com um preço unitário muito acima da mediana. Só vale quando há um preço de
 * referência estável (a maioria dos itens perto da mediana); produto com preços espalhados é
 * catálogo genérico e não gera achado. O código de catálogo pode agrupar produtos diferentes,
 * então o texto pede conferência e a severidade é `info`. Contexto: { itens } já carregados
 * (item + dados do empenho), sem acesso a banco.
 */

const crypto = require('node:crypto');
const { buildPortalDespesaLink } = require('../../transparencia/portal-links');
const { motivoExclusao } = require('../limites-dispensa');
const { formatBRL } = require('../tipos');

const TIPO_ORIGINAL = 'EO';
const MIN_ITENS = 4;
const MIN_EMPENHOS = 3;
const RAZAO_MINIMA = 3;
const EXCESSO_MINIMO_REAIS = 100;
const FAIXA_ESTAVEL = 0.3;
const SHARE_ESTAVEL = 0.6;
const MAX_EVIDENCIAS_POR_LADO = 3;
const CENTAVOS = 100;
const RAZAO = 'x';

const CAMPOS_A_VERIFICAR = [
  'se os empenhos comparados são do mesmo produto e especificação',
  'quantidade, unidade e nota fiscal de cada empenho',
];

// Peça para manutenção de um equipamento específico: o mesmo código de catálogo cobre peças de
// especificações muito diferentes (carro, caminhão, motoniveladora), então o preço não compara.
const SOB_MEDIDA = /manutencao d[oa]s? |\bplaca\b|pecas de reposicao/;
const normalizar = texto =>
  String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

const arredonda = n => Math.round(n * CENTAVOS) / CENTAVOS;
const dataBR = iso => String(iso).split('-').reverse().join('/');
const digitos = v => String(v ?? '').replace(/\D/g, '');

function mediana(valores) {
  const v = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
}

function comparavel(i) {
  return (
    String(i.tipo || '')
      .toUpperCase()
      .startsWith(TIPO_ORIGINAL) &&
    i.produto_codigo &&
    String(i.unidade ?? '').trim() &&
    i.valor_unitario > 0 &&
    i.quantidade > 0 &&
    !motivoExclusao({ credor_documento: i.credor_cnpj, historico: i.historico }) &&
    !SOB_MEDIDA.test(normalizar(i.historico))
  );
}

function agrupar(itens) {
  const grupos = new Map();
  for (const i of itens.filter(comparavel)) {
    const k = `${i.produto_codigo}|${String(i.unidade).trim().toUpperCase()}`;
    if (!grupos.has(k)) {
      grupos.set(k, []);
    }
    grupos.get(k).push(i);
  }
  return grupos;
}

function temReferenciaEstavel(grupo, ref) {
  const perto = grupo.filter(i => Math.abs(i.valor_unitario - ref) <= ref * FAIXA_ESTAVEL);
  return perto.length / grupo.length >= SHARE_ESTAVEL;
}

function evidenciaDoItem(i, papel) {
  const url = buildPortalDespesaLink({
    empenho: i.empenho,
    exercicio: i.exercicio_orcamento,
    tipo: i.tipo,
  }).url;
  return {
    fonte_id: `I${i.item_id}`,
    papel,
    evidencia_hash: crypto.createHash('sha256').update(`item:${i.item_id}`, 'utf8').digest('hex'),
    trecho: `${i.produto} (${i.unidade}) ${i.quantidade} × ${formatBRL(i.valor_unitario)}`,
    url_origem: url,
    metadados: {
      empenho: i.empenho,
      exercicio: i.exercicio_orcamento,
      data_empenho: i.data_empenho,
      credor_nome: i.credor_nome,
      valor_unitario: i.valor_unitario,
      quantidade: i.quantidade,
      portal_url: url,
    },
  };
}

function textoDoAchado({ grupo, ref, altos, razao }) {
  const maior = altos[altos.length - 1];
  const primeiro = grupo[0];
  const datas = grupo.map(i => i.data_empenho).sort();
  return {
    titulo:
      `${primeiro.produto}: preço unitário de ${formatBRL(maior.valor_unitario)} em ` +
      `${dataBR(maior.data_empenho)}, ${razao.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}× a mediana de ${formatBRL(ref)}`,
    narrativa:
      `O produto "${primeiro.produto}" (código ${primeiro.produto_codigo}, unidade ${primeiro.unidade}) ` +
      `aparece em ${grupo.length} itens de ${new Set(grupo.map(i => i.despesa_id)).size} empenhos entre ` +
      `${dataBR(datas[0])} e ${dataBR(datas[datas.length - 1])}, com preço unitário mediano de ${formatBRL(ref)}. ` +
      `Em ${altos.length} item(ns) o preço foi de ${altos.map(i => formatBRL(i.valor_unitario)).join(', ')}. ` +
      'Itens com o mesmo código de catálogo podem ser produtos diferentes (modelo, tamanho, marca); ' +
      'o sistema não tem a especificação. Confira nos empenhos e notas fiscais se são o mesmo item.',
  };
}

function candidatoDoGrupo(grupo) {
  if (grupo.length < MIN_ITENS || new Set(grupo.map(i => i.despesa_id)).size < MIN_EMPENHOS) {
    return null;
  }
  const ref = mediana(grupo.map(i => i.valor_unitario));
  if (!temReferenciaEstavel(grupo, ref)) {
    return null;
  }
  const altos = grupo
    .filter(
      i =>
        i.valor_unitario >= ref * RAZAO_MINIMA &&
        (i.valor_unitario - ref) * i.quantidade >= EXCESSO_MINIMO_REAIS
    )
    .sort((a, b) => a.valor_unitario - b.valor_unitario);
  if (!altos.length) {
    return null;
  }
  const maior = altos[altos.length - 1];
  const razao = maior.valor_unitario / ref;
  const referencia = grupo
    .filter(i => !altos.includes(i))
    .sort((a, b) => Math.abs(a.valor_unitario - ref) - Math.abs(b.valor_unitario - ref))
    .slice(0, MAX_EVIDENCIAS_POR_LADO);
  const datas = grupo.map(i => i.data_empenho).sort();
  return {
    objeto: `${grupo[0].produto_codigo}|${grupo[0].unidade}`,
    ...textoDoAchado({ grupo, ref, altos, razao }),
    categoria: 'Preços de itens',
    metrica: {
      nome: 'razao_preco',
      unidade: RAZAO,
      valor: arredonda(razao),
      mediana: arredonda(ref),
      maior_preco: maior.valor_unitario,
      itens: grupo.length,
    },
    evidencias: [
      ...altos.slice(-MAX_EVIDENCIAS_POR_LADO).map(i => evidenciaDoItem(i, 'preco_alto')),
      ...referencia.map(i => evidenciaDoItem(i, 'preco_referencia')),
    ],
    periodo: { inicio: datas[0], fim: datas[datas.length - 1] },
    severidade: 'info',
    questionamentos: [
      'Os empenhos comparados são do mesmo produto, com a mesma especificação?',
      'Houve diferença de marca, modelo ou quantidade que explique o preço?',
    ],
    campos_a_verificar: CAMPOS_A_VERIFICAR,
    alerta: {
      tipo: 'preco_item',
      subcategoria: 'preco_acima_da_referencia',
      metadados: {
        regra: 'preco_acima_da_referencia',
        produto_codigo: grupo[0].produto_codigo,
        produto: grupo[0].produto,
        unidade: grupo[0].unidade,
        mediana: arredonda(ref),
        campos_a_verificar: CAMPOS_A_VERIFICAR,
        digitos_credores: [...new Set(altos.map(i => digitos(i.credor_cnpj)))],
      },
    },
  };
}

function detectar({ itens = [] } = {}) {
  return [...agrupar(itens).values()].map(candidatoDoGrupo).filter(Boolean);
}

module.exports = {
  nome: 'preco-itens',
  versao: 1,
  criterio:
    'Mesmo código de produto e unidade em pelo menos 4 itens de 3 empenhos, com preço de referência estável (60% dos itens perto da mediana) e algum item com preço unitário 3 vezes ou mais acima da mediana.',
  detectar,
};
