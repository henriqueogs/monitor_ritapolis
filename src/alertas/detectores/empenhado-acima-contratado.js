'use strict';

// Detector "empenhado acima do contratado": soma os empenhos de um fornecedor
// que citam um processo licitatório no histórico e compara com o valor do
// contrato publicado nesse processo. Puro (sem banco).
//
// Regras rígidas para não gerar ruído (cada uma veio de um falso positivo real):
//  - o valor do contrato é lido do texto publicado ("Valor do contrato: R$",
//    "valor total de R$"); valor mensal/anual ou mais de um valor = ignora;
//  - ordem de pagamento (OP) repete o empenho e não entra na soma;
//  - com vencedor conhecido, só conta empenho do mesmo CNPJ; sem vencedor, só
//    quando um único credor cita o processo;
//  - só credor com CNPJ (14 dígitos): pessoa física ou credor sem documento não
//    é agrupado nem nomeado (LGPD, fiscal-privacidade L2);
//  - o mesmo empenho recoletado em duas linhas conta uma vez;
//  - consórcio público fica de fora (contrato de rateio tem outra lógica);
//  - margem de 25% (limite de acréscimo do art. 125 da Lei 14.133) e excesso
//    mínimo em reais.

const { mascararCpf } = require('../../ai/rag/privacidade');

const FATOR_LIMITE_PADRAO = 1.25;
const EXCESSO_MINIMO_PADRAO = 10000;
const SECULO = 2000;
const DIGITOS_ANO_CURTO = 2;
const DIGITOS_CNPJ = 14;

const RE_PROCESSO_CITADO = /PROCESSO\s+LICITAT[OÓ]RIO\s*(?:N[°ºO.]*)?\s*0*(\d{1,4})\s*\/\s*(\d{2}(?:\d{2})?)\b/i;
const RE_PROCESSO_TITULO = /^Processo\s+0*(\d{1,4})\/(\d{4})/i;
const RE_VALOR_CONTRATO =
  /(?:valor\s+(?:total\s+)?(?:do\s+contrato|global|total)|pre[cç]o\s+global)\s*(?:de|:|é|–|-)?\s*(?:de\s+)?R\$\s*([\d.]+,\d{2})([^.;]{0,80})/gi;
const RE_PERIODICO =
  /m[eê]s|mensa|por\s+ano|anual|unit[aá]ri|por\s+(?:ponto|unidade|item|hora|km|quil[oô]metro|litro|metro|di[aá]ria)/i;
const RE_CONSORCIO = /\bCONS[.\s]|CONS[OÓ]RCIO/i;
const RE_ORDEM_PAGAMENTO = /^OP/i;

const somenteDigitos = (valor) => String(valor ?? '').replace(/\D/g, '');
const valorBrl = (texto) => Number(texto.replace(/\./g, '').replace(',', '.'));
const centavos = (valor) => Math.round(valor * 100) / 100;

function anoCompleto(texto) {
  return texto.length === DIGITOS_ANO_CURTO ? SECULO + Number(texto) : Number(texto);
}

function extrairProcessoCitado(historico) {
  const m = RE_PROCESSO_CITADO.exec(String(historico ?? ''));
  return m ? { numero: Number(m[1]), ano: anoCompleto(m[2]) } : null;
}

function processoDoTitulo(titulo) {
  const m = RE_PROCESSO_TITULO.exec(String(titulo ?? ''));
  return m ? { numero: Number(m[1]), ano: Number(m[2]) } : null;
}

const chaveProcesso = ({ numero, ano }) => `${numero}/${ano}`;

// Valores do contrato num texto: { valores: Set, periodico }.
function lerValores(texto) {
  const valores = new Set();
  for (const [, valor, contexto] of String(texto ?? '').matchAll(RE_VALOR_CONTRATO)) {
    if (RE_PERIODICO.test(contexto)) {
      return { valores, periodico: true };
    }
    valores.add(valorBrl(valor));
  }
  return { valores, periodico: false };
}

function extrairValorContrato(texto) {
  const { valores, periodico } = lerValores(texto);
  return !periodico && valores.size === 1 ? [...valores][0] : null;
}

const TRECHO_ANTES = 80;
const TRECHO_DEPOIS = 160;

// Trecho literal do texto oficial em volta do valor do contrato (evidência §11.3).
// CPF de signatário eventualmente no trecho é mascarado (LGPD).
function trechoDoValor(texto) {
  const alvo = String(texto ?? '');
  const m = new RegExp(RE_VALOR_CONTRATO.source, 'i').exec(alvo);
  if (!m) {
    return null;
  }
  const trecho = alvo.slice(Math.max(0, m.index - TRECHO_ANTES), m.index + TRECHO_DEPOIS);
  return mascararCpf(trecho).replace(/\s+/g, ' ').trim();
}

// Lê o valor em todas as fontes do processo (trecho do detalhe e anexos de
// contrato/extrato). Só aceita um valor único e não periódico entre todas; a
// citação aponta a primeira fonte onde ele aparece.
function localizarValorContrato(fontes) {
  const valores = new Set();
  let origem = null;
  for (const fonte of fontes || []) {
    const lido = lerValores(fonte.texto);
    if (lido.periodico) {
      return null;
    }
    lido.valores.forEach((v) => valores.add(v));
    if (!origem && lido.valores.size) {
      origem = fonte;
    }
  }
  if (valores.size !== 1) {
    return null;
  }
  return {
    valor: [...valores][0],
    anexo_id: origem.anexo_id ?? null,
    anexo_nome: origem.nome ?? null,
    trecho: trechoDoValor(origem.texto),
  };
}

function fontesDoProcesso(processo) {
  const fontes = Array.isArray(processo.fontes) ? processo.fontes : [];
  return processo.texto ? [{ anexo_id: null, nome: null, texto: processo.texto }, ...fontes] : fontes;
}

function indexarProcessos(processos) {
  const porChave = new Map();
  for (const processo of processos) {
    const id = processoDoTitulo(processo.titulo);
    const lido = id ? localizarValorContrato(fontesDoProcesso(processo)) : null;
    if (!lido) {
      continue;
    }
    porChave.set(chaveProcesso(id), {
      ...processo,
      processo: chaveProcesso(id),
      valor_contrato: lido.valor,
      trecho_contrato: lido.trecho,
      anexo_id: lido.anexo_id,
      anexo_nome: lido.anexo_nome,
    });
  }
  return porChave;
}

function empenhoElegivel(e) {
  if (RE_ORDEM_PAGAMENTO.test(e.tipo || '') || RE_CONSORCIO.test(e.credor_nome || '')) {
    return false;
  }
  return somenteDigitos(e.credor_cnpj).length === DIGITOS_CNPJ;
}

const chaveEmpenho = (e) => `${e.empenho}|${e.exercicio_orcamento}|${e.tipo}`;

function agruparEmpenhos(empenhos, processosPorChave) {
  const grupos = new Map();
  const vistos = new Set();
  for (const e of empenhos) {
    if (!empenhoElegivel(e) || vistos.has(chaveEmpenho(e))) {
      continue;
    }
    vistos.add(chaveEmpenho(e));
    const citado = extrairProcessoCitado(e.historico);
    const processo = citado && processosPorChave.get(chaveProcesso(citado));
    if (!processo) {
      continue;
    }
    const lista = grupos.get(processo.processo) || [];
    lista.push(e);
    grupos.set(processo.processo, lista);
  }
  return grupos;
}

function empenhosDoContratado(processo, empenhos) {
  const vencedor = somenteDigitos(processo.vencedor_cnpj);
  if (vencedor) {
    return empenhos.filter((e) => somenteDigitos(e.credor_cnpj) === vencedor);
  }
  const credores = new Set(empenhos.map((e) => somenteDigitos(e.credor_cnpj)));
  return credores.size === 1 ? empenhos : [];
}

function montarSinal(processo, empenhos) {
  const valorEmpenhado = centavos(empenhos.reduce((total, e) => total + (Number(e.valor) || 0), 0));
  const anos = empenhos.map((e) => Number(e.exercicio_orcamento)).filter(Boolean);
  return {
    documento_id: processo.documento_id,
    titulo_processo: processo.titulo,
    trecho_contrato: processo.trecho_contrato,
    anexo_id: processo.anexo_id,
    anexo_nome: processo.anexo_nome,
    url_origem: processo.url_origem || null,
    url_pdf: processo.url_pdf || null,
    processo: processo.processo,
    credor_nome: empenhos[0].credor_nome,
    credor_cnpj: somenteDigitos(empenhos[0].credor_cnpj),
    valor_contrato: processo.valor_contrato,
    valor_empenhado: valorEmpenhado,
    excesso: centavos(valorEmpenhado - processo.valor_contrato),
    razao: valorEmpenhado / processo.valor_contrato,
    empenho_ids: empenhos.map((e) => e.id),
    ano_inicio: Math.min(...anos),
    ano_fim: Math.max(...anos),
  };
}

function detectarEmpenhadoAcimaContratado(
  { processos = [], empenhos = [] },
  { fatorLimite = FATOR_LIMITE_PADRAO, excessoMinimo = EXCESSO_MINIMO_PADRAO } = {}
) {
  const processosPorChave = indexarProcessos(processos);
  const sinais = [];
  for (const [chave, citantes] of agruparEmpenhos(empenhos, processosPorChave)) {
    const processo = processosPorChave.get(chave);
    const doContratado = empenhosDoContratado(processo, citantes);
    if (!doContratado.length) {
      continue;
    }
    const sinal = montarSinal(processo, doContratado);
    if (sinal.valor_empenhado > processo.valor_contrato * fatorLimite && sinal.excesso >= excessoMinimo) {
      sinais.push(sinal);
    }
  }
  return sinais.sort((a, b) => b.razao - a.razao);
}

module.exports = {
  extrairProcessoCitado,
  processoDoTitulo,
  extrairValorContrato,
  trechoDoValor,
  localizarValorContrato,
  detectarEmpenhadoAcimaContratado,
  FATOR_LIMITE_PADRAO,
  EXCESSO_MINIMO_PADRAO,
};
