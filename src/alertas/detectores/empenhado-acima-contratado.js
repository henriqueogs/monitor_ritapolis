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

const FATOR_LIMITE_PADRAO = 1.25;
const EXCESSO_MINIMO_PADRAO = 10000;
const SECULO = 2000;
const DIGITOS_ANO_CURTO = 2;
const DIGITOS_CNPJ = 14;

const RE_PROCESSO_CITADO = /PROCESSO\s+LICITAT[OÓ]RIO\s*(?:N[°ºO.]*)?\s*0*(\d{1,4})\s*\/\s*(\d{2}(?:\d{2})?)\b/i;
const RE_PROCESSO_TITULO = /^Processo\s+0*(\d{1,4})\/(\d{4})/i;
const RE_VALOR_CONTRATO =
  /valor\s+(?:total\s+)?(?:do\s+contrato|global|total)\s*(?:de|:|é)?\s*(?:de\s+)?R\$\s*([\d.]+,\d{2})([^.;]{0,80})/gi;
const RE_PERIODICO = /m[eê]s|mensa|por\s+ano|anual|unit[aá]ri/i;
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

function extrairValorContrato(texto) {
  const valores = new Set();
  for (const [, valor, contexto] of String(texto ?? '').matchAll(RE_VALOR_CONTRATO)) {
    if (RE_PERIODICO.test(contexto)) {
      return null;
    }
    valores.add(valorBrl(valor));
  }
  return valores.size === 1 ? [...valores][0] : null;
}

const TRECHO_ANTES = 80;
const TRECHO_DEPOIS = 160;

// Trecho literal do texto oficial em volta do valor do contrato (evidência §11.3).
function trechoDoValor(texto) {
  const alvo = String(texto ?? '');
  const m = new RegExp(RE_VALOR_CONTRATO.source, 'i').exec(alvo);
  if (!m) {
    return null;
  }
  return alvo.slice(Math.max(0, m.index - TRECHO_ANTES), m.index + TRECHO_DEPOIS).replace(/\s+/g, ' ').trim();
}

function indexarProcessos(processos) {
  const porChave = new Map();
  for (const processo of processos) {
    const id = processoDoTitulo(processo.titulo);
    const valor = id ? extrairValorContrato(processo.texto) : null;
    if (!valor) {
      continue;
    }
    porChave.set(chaveProcesso(id), {
      ...processo,
      processo: chaveProcesso(id),
      valor_contrato: valor,
      trecho_contrato: trechoDoValor(processo.texto),
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
  detectarEmpenhadoAcimaContratado,
  FATOR_LIMITE_PADRAO,
  EXCESSO_MINIMO_PADRAO,
};
