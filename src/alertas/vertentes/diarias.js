'use strict';

/**
 * Vertente "diárias" (categoria 3.3.90.14), só agregada: o beneficiário é pessoa física, então
 * nenhum nome, chave ou perfil individual sai daqui (fiscal-privacidade L2). Dois sinais:
 *  - crescimento: diárias empenhadas no ano corrente até a última data versus o MESMO período
 *    do ano anterior, e só dentro do mesmo mandato (fiscal-datas: nada de um mandato
 *    contamina o outro);
 *  - concentração: poucos beneficiários (top 5) com grande parte do valor do ano.
 * Contexto: { empenhos } já carregados. Candidatos sempre em `revisao`, severidade `info`.
 */

const crypto = require('node:crypto');
const { buildPortalDespesaLink } = require('../../transparencia/portal-links');
const { mandatoInicio, mandatoLabel } = require('../../utils/mandato');
const { formatBRL } = require('../tipos');

const TIPO_ORIGINAL = 'EO';
const PREFIXO_DIARIAS = '3.3.90.14';
const ALTA_MINIMA = 0.3;
const ALTA_MINIMA_REAIS = 20000;
const TOP_N = 5;
const SHARE_MINIMO = 0.5;
const MIN_BENEFICIARIOS = 20;
const TOTAL_MINIMO_REAIS = 50000;
const MAX_EVIDENCIAS = 3;
const CENTAVOS = 100;
const PERCENTUAL = 100;
const MOEDA = 'R$';

const arredonda = n => Math.round(n * CENTAVOS) / CENTAVOS;
const dataBR = iso => String(iso).split('-').reverse().join('/');
const soma = lista => lista.reduce((t, e) => t + e.valor, 0);
const pct = n => `${Math.round(n * PERCENTUAL)}%`;

const ehDiaria = e =>
  String(e.tipo || '')
    .toUpperCase()
    .startsWith(TIPO_ORIGINAL) &&
  String(e.categoria_economica || '').startsWith(PREFIXO_DIARIAS) &&
  e.valor > 0 &&
  e.data_empenho;

function evidenciasDosMaiores(lista) {
  return [...lista]
    .sort((a, b) => b.valor - a.valor)
    .slice(0, MAX_EVIDENCIAS)
    .map(e => {
      const url = buildPortalDespesaLink({
        empenho: e.empenho,
        exercicio: e.exercicio_orcamento,
        tipo: e.tipo,
      }).url;
      return {
        fonte_id: `E${e.id}`,
        papel: 'empenho',
        evidencia_hash: crypto.createHash('sha256').update(`diaria:${e.id}`, 'utf8').digest('hex'),
        trecho: `Empenho ${e.empenho}/${e.exercicio_orcamento}: ${formatBRL(e.valor)}`,
        url_origem: url,
        // Sem nome do beneficiário: a página oficial do portal o traz, o nosso alerta não.
        metadados: {
          empenho: e.empenho,
          exercicio: e.exercicio_orcamento,
          valor: e.valor,
          portal_url: url,
        },
      };
    });
}

const base = () => ({
  categoria: 'Diárias',
  severidade: 'info',
  questionamentos: [],
  campos_a_verificar: ['soma e período dos empenhos de diárias', 'finalidade das viagens'],
});

function candidatoCrescimento(porAno) {
  const anos = [...porAno.keys()].sort((a, b) => b - a);
  const atual = anos[0];
  if (!porAno.has(atual - 1) || mandatoInicio(atual) !== mandatoInicio(atual - 1)) {return null;}
  const ate = porAno
    .get(atual)
    .map(e => e.data_empenho.slice(5))
    .sort()
    .pop();
  const noPeriodo = ano => porAno.get(ano).filter(e => e.data_empenho.slice(5) <= ate);
  const valorAtual = arredonda(soma(noPeriodo(atual)));
  const valorAnterior = arredonda(soma(noPeriodo(atual - 1)));
  if (!valorAnterior || valorAtual < valorAnterior * (1 + ALTA_MINIMA)) {return null;}
  if (valorAtual - valorAnterior < ALTA_MINIMA_REAIS) {return null;}
  const variacao = valorAtual / valorAnterior - 1;
  return {
    ...base(),
    objeto: `diarias|crescimento|${atual}`,
    titulo: `Diárias de ${atual} somam ${formatBRL(valorAtual)} até ${dataBR(`${atual}-${ate}`)}, ${pct(variacao)} acima do mesmo período de ${atual - 1}`,
    narrativa:
      `Os empenhos originais de diárias de 01/01/${atual} a ${dataBR(`${atual}-${ate}`)} somam ${formatBRL(valorAtual)}; ` +
      `no mesmo período de ${atual - 1} foram ${formatBRL(valorAnterior)} (alta de ${pct(variacao)}). ` +
      `Os dois anos estão no mesmo mandato (${mandatoLabel(mandatoInicio(atual))}). ` +
      'O aumento pode ter explicação (mais viagens autorizadas, reajuste do valor da diária); ' +
      'confira a finalidade das viagens nos empenhos.',
    metrica: {
      nome: 'diarias_periodo',
      unidade: MOEDA,
      valor: valorAtual,
      anterior: valorAnterior,
      variacao: arredonda(variacao),
    },
    evidencias: evidenciasDosMaiores(noPeriodo(atual)),
    periodo: { inicio: `${atual}-01-01`, fim: `${atual}-${ate}` },
    alerta: {
      tipo: 'diarias',
      subcategoria: 'diarias_crescimento',
      metadados: { regra: 'diarias_crescimento', unidade: MOEDA },
    },
  };
}

function candidatoConcentracao(ano, lista) {
  const porBeneficiario = new Map();
  for (const e of lista)
    {porBeneficiario.set(e.credor_chave, (porBeneficiario.get(e.credor_chave) || 0) + e.valor);}
  const total = soma(lista);
  if (porBeneficiario.size < MIN_BENEFICIARIOS || total < TOTAL_MINIMO_REAIS) {return null;}
  const top = [...porBeneficiario.values()].sort((a, b) => b - a).slice(0, TOP_N);
  const share = top.reduce((t, v) => t + v, 0) / total;
  if (share < SHARE_MINIMO) {return null;}
  return {
    ...base(),
    objeto: `diarias|concentracao|${ano}`,
    titulo: `${TOP_N} de ${porBeneficiario.size} beneficiários concentram ${pct(share)} das diárias de ${ano}`,
    narrativa:
      `Em ${ano}, os empenhos originais de diárias somam ${formatBRL(arredonda(total))} para ` +
      `${porBeneficiario.size} beneficiários; ${TOP_N} de ${porBeneficiario.size} beneficiários (os que mais receberam) ` +
      `concentram ${pct(share)} do valor. Quem mais viaja a serviço (gestores, motoristas) tende a concentrar; ` +
      'o sistema não identifica pessoas aqui. Confira a finalidade das viagens nos empenhos.',
    metrica: {
      nome: 'concentracao_top5',
      unidade: MOEDA,
      valor: arredonda(total),
      share: arredonda(share),
      beneficiarios: porBeneficiario.size,
    },
    evidencias: evidenciasDosMaiores(lista),
    periodo: { inicio: `${ano}-01-01`, fim: `${ano}-12-31` },
    alerta: {
      tipo: 'diarias',
      subcategoria: 'diarias_concentracao',
      metadados: { regra: 'diarias_concentracao', unidade: MOEDA },
    },
  };
}

function detectar({ empenhos = [] } = {}) {
  const porAno = new Map();
  for (const e of empenhos.filter(ehDiaria)) {
    const ano = Number(e.exercicio_orcamento);
    if (!porAno.has(ano)) {porAno.set(ano, []);}
    porAno.get(ano).push(e);
  }
  if (!porAno.size) {return [];}
  const concentracoes = [...porAno].map(([ano, lista]) => candidatoConcentracao(ano, lista));
  return [candidatoCrescimento(porAno), ...concentracoes].filter(Boolean);
}

module.exports = {
  nome: 'diarias',
  versao: 1,
  criterio:
    'Diárias (3.3.90.14) agregadas: alta de 30% ou mais (e R$ 20 mil) sobre o mesmo período do ano anterior no mesmo mandato, ou 5 beneficiários com 50% ou mais do valor do ano (com pelo menos 20 beneficiários e R$ 50 mil).',
  detectar,
};
