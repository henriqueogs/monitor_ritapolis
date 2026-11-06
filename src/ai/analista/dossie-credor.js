'use strict';

/**
 * Dossiê de credor para o Analista IA (Na Lupa v4, trilha 2): reúne, para um fornecedor PJ,
 * os fatos que o modelo pode citar. Cada fato é uma "fonte" com id, texto literal e
 * url_origem (§11.3); os totais vêm de um RESUMO calculado pelo sistema, porque o modelo não
 * soma (fiscal-valores). Puro: recebe os dados já carregados.
 */

const { buildPortalDespesaLink } = require('../../transparencia/portal-links');
const { estimateTokensFromText } = require('../estimate-tokens');
const { mascararCpf } = require('./selecao');
const { formatBRL: formatarMoeda } = require('../../alertas/tipos');

const TIPO_ORIGINAL = 'EO';
const MAX_EMPENHOS_PADRAO = 80;
const TRECHO_HISTORICO_MAX = 220;
const CENTAVOS = 100;
const FONTE_RESUMO = 'RESUMO';

// O Intl usa espaço sem quebra entre "R$" e o número; texto simples poupa tokens e casa com o que o modelo cita.
const formatBRL = v => formatarMoeda(v).replace(/\u00a0/g, ' ');
const soDigitos = v => String(v ?? '').replace(/\D/g, '');
const dataBR = iso =>
  String(iso ?? '')
    .split('-')
    .reverse()
    .join('/');
const arredonda = n => Math.round(n * CENTAVOS) / CENTAVOS;
const ehOriginal = e =>
  String(e.tipo || '')
    .toUpperCase()
    .startsWith(TIPO_ORIGINAL);

function fonteDeEmpenho(e) {
  const link = buildPortalDespesaLink({
    empenho: e.empenho,
    exercicio: e.exercicio_orcamento,
    tipo: e.tipo,
  });
  const historico = mascararCpf(e.historico)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, TRECHO_HISTORICO_MAX);
  return {
    fonte_id: `E${e.id}`,
    url_origem: link.url,
    texto:
      `Empenho ${e.empenho}/${e.exercicio_orcamento} (${e.tipo}) em ${dataBR(e.data_empenho)}: ` +
      `${formatBRL(e.valor)} — ${historico}`,
  };
}

function fonteDeLicitacao(l) {
  return {
    fonte_id: `L${l.documento_id}`,
    url_origem: l.url_origem,
    texto:
      `${mascararCpf(l.titulo)} — vencedor CNPJ ${soDigitos(l.vencedor_cnpj)}` +
      (l.valor_final ? `, valor final ${formatBRL(l.valor_final)}` : ''),
  };
}

// Se há mais empenhos que o limite: metade pelos maiores valores, metade pelos mais recentes.
function escolherEmpenhos(empenhos, maximo) {
  if (empenhos.length <= maximo) {
    return empenhos;
  }
  const porValor = [...empenhos].sort((a, b) => b.valor - a.valor).slice(0, Math.ceil(maximo / 2));
  const usados = new Set(porValor.map(e => e.id));
  const recentes = [...empenhos]
    .filter(e => !usados.has(e.id))
    .sort((a, b) => String(b.data_empenho).localeCompare(String(a.data_empenho)))
    .slice(0, maximo - porValor.length);
  return [...porValor, ...recentes];
}

function linhaPorAno(originais) {
  const porAno = new Map();
  for (const e of originais) {
    const atual = porAno.get(e.exercicio_orcamento) || { n: 0, total: 0 };
    porAno.set(e.exercicio_orcamento, { n: atual.n + 1, total: atual.total + e.valor });
  }
  return [...porAno.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([ano, v]) => `${ano}: ${v.n} empenhos, ${formatBRL(arredonda(v.total))}`)
    .join('; ');
}

function textoResumo({ credor, originais, mostrados }) {
  const datas = originais
    .map(e => e.data_empenho)
    .filter(Boolean)
    .sort();
  const total = arredonda(originais.reduce((t, e) => t + e.valor, 0));
  return (
    `Resumo calculado pelo sistema: ${originais.length} empenhos originais (EO) de ${mascararCpf(credor.nome)} ` +
    `(CNPJ ${soDigitos(credor.cnpj)}) entre ${dataBR(datas[0])} e ${dataBR(datas[datas.length - 1])}, ` +
    `total ${formatBRL(total)}. Por ano — ${linhaPorAno(originais)}.` +
    (mostrados < originais.length
      ? ` Abaixo estão ${mostrados} de ${originais.length} empenhos (os de maior valor e os mais recentes).`
      : '')
  );
}

function montarDossieCredor({
  credor,
  empenhos = [],
  licitacoes = [],
  maxEmpenhos = MAX_EMPENHOS_PADRAO,
}) {
  const originais = empenhos.filter(ehOriginal);
  const escolhidos = escolherEmpenhos(originais, maxEmpenhos);
  const fontes = [
    {
      fonte_id: FONTE_RESUMO,
      url_origem: buildPortalDespesaLink({}).url,
      texto: textoResumo({ credor, originais, mostrados: escolhidos.length }),
    },
    ...escolhidos.map(fonteDeEmpenho),
    ...licitacoes.map(fonteDeLicitacao),
  ];
  return {
    tipo: 'credor',
    chave: `credor:${soDigitos(credor.cnpj)}`,
    titulo: `${mascararCpf(credor.nome)} (CNPJ ${soDigitos(credor.cnpj)})`,
    amostra: escolhidos.length < originais.length,
    fontes,
    tokens_estimados: estimateTokensFromText(fontes.map(f => f.texto).join('\n')),
  };
}

module.exports = { montarDossieCredor };
