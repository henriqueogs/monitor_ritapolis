'use strict';

/**
 * Eval de GERAÇÃO (ADR 0005/0006): recupera o contexto, deixa o LLMProvider injetado responder e
 * mede fundamentação (citar ou recusar), citações válidas, alucinação, recusa correta, linguagem
 * acusatória e cobertura de fatos. Falha do provedor (429, modelo morto) ABORTA a rodada:
 * nota calculada sobre erro de infraestrutura não é nota.
 *
 * dataset: { id, pergunta, fontes_esperadas, filtros?, deve_recusar?, fatos_obrigatorios?, resposta_referencia? }[]
 * recuperar(pergunta, { k, filtros }) → [{ id, docId, texto, url_origem, score }]
 */

const { avaliarFundamentacao, recusaCorreta, media } = require('./metricas');
const { numerosInventados, termosAcusatorios, coberturaFatos } = require('./metricas-geracao');
const { responderComContexto, RespostaForaDoContratoError } = require('../rag/resposta');
const { RespostaNaoJsonError } = require('../ports/json-resposta');
const { VERSAO_PROMPT } = require('../prompts/rag-resposta');

const K_PADRAO = 5;
const LIMIAR_EVIDENCIA_PADRAO = 0.2;
const TOLERANCIA_PADRAO = 0.02;
const CASAS = 3;

// Mínimos e máximos do gate (ADR 0006). Suba conforme o dataset real crescer; nunca desça para o CI passar.
const MINIMOS_GERACAO = Object.freeze({
  recusa_correta_pct: 0.9,
  fundamentacao_ok_pct: 0.95,
  citacao_valida_pct: 0.95,
  cobertura_fatos_medio: 0.8,
});
const MAXIMOS_GERACAO = Object.freeze({
  alucinacao_pct: 0.05,
  linguagem_acusatoria_pct: 0,
  malformadas: 0,
});

const METRICAS = [
  'recusa_correta_pct',
  'fundamentacao_ok_pct',
  'citacao_valida_pct',
  'alucinacao_pct',
  'cobertura_fatos_medio',
  'linguagem_acusatoria_pct',
  'malformadas',
];
const MENOR_E_MELHOR = new Set(['alucinacao_pct', 'linguagem_acusatoria_pct', 'malformadas']);

const ehMalformacao = err =>
  err instanceof RespostaForaDoContratoError || err instanceof RespostaNaoJsonError;
const formatar = v => (v === null || v === undefined ? 'n/d' : Number(v).toFixed(CASAS));
const razao = (parte, total) => (total ? parte / total : null);

const paraContexto = r => ({ id: r.id, docId: r.docId, texto: r.texto, url_origem: r.url_origem });

function itemMalformado(item) {
  return {
    id: item.id,
    malformada: true,
    recusou: null,
    recusa_correta: false,
    fundamentacao_ok: null,
    motivos: [],
    citacoes_validas: 0,
    citacoes_total: 0,
    numeros_inventados: [],
    termos_acusatorios: [],
    cobertura_fatos: null,
    alucinou: false,
  };
}

function avaliarItem(item, resposta, contexto) {
  const fundamentacao = avaliarFundamentacao({ resposta, contexto });
  const inventados = resposta.recusou ? [] : numerosInventados(resposta.resposta, contexto);
  return {
    id: item.id,
    malformada: false,
    recusou: resposta.recusou,
    recusa_correta: recusaCorreta(resposta, item.deve_recusar),
    fundamentacao_ok: fundamentacao.ok,
    motivos: fundamentacao.motivos,
    citacoes_validas: fundamentacao.validas,
    citacoes_total: fundamentacao.total,
    numeros_inventados: inventados,
    termos_acusatorios: termosAcusatorios(resposta.resposta),
    cobertura_fatos: resposta.recusou
      ? null
      : coberturaFatos(resposta.resposta, item.fatos_obrigatorios),
    alucinou: !resposta.recusou && (!fundamentacao.ok || inventados.length > 0),
    resposta: resposta.resposta,
  };
}

function resumir(perguntas) {
  const respondidas = perguntas.filter(p => !p.malformada && !p.recusou);
  const totalCitacoes = respondidas.reduce((a, p) => a + p.citacoes_total, 0);
  const conta = (lista, fn) => lista.filter(fn).length;
  return {
    n: perguntas.length,
    n_respondidas: respondidas.length,
    n_com_fatos: respondidas.filter(p => p.cobertura_fatos !== null).length,
    recusa_correta_pct: razao(
      conta(perguntas, p => p.recusa_correta),
      perguntas.length
    ),
    fundamentacao_ok_pct: razao(
      conta(respondidas, p => p.fundamentacao_ok),
      respondidas.length
    ),
    citacao_valida_pct: razao(
      respondidas.reduce((a, p) => a + p.citacoes_validas, 0),
      totalCitacoes
    ),
    alucinacao_pct: razao(
      conta(respondidas, p => p.alucinou),
      respondidas.length
    ),
    cobertura_fatos_medio: media(respondidas.map(p => p.cobertura_fatos)),
    linguagem_acusatoria_pct: razao(
      conta(respondidas, p => p.termos_acusatorios.length > 0),
      respondidas.length
    ),
    malformadas: conta(perguntas, p => p.malformada),
  };
}

async function avaliarPergunta({ item, recuperar, llm, k, limiarEvidencia }) {
  const resultados = await recuperar(item.pergunta, { k, filtros: item.filtros });
  const contexto = resultados.filter(r => r.score >= limiarEvidencia).map(paraContexto);
  try {
    const resposta = await responderComContexto({ pergunta: item.pergunta, contexto, llm });
    return avaliarItem(item, resposta, contexto);
  } catch (err) {
    if (ehMalformacao(err)) {
      return itemMalformado(item);
    }
    throw err;
  }
}

async function rodarEvalGeracao({
  dataset,
  recuperar,
  llm,
  k = K_PADRAO,
  limiarEvidencia = LIMIAR_EVIDENCIA_PADRAO,
}) {
  const perguntas = [];
  for (const item of dataset) {
    perguntas.push(await avaliarPergunta({ item, recuperar, llm, k, limiarEvidencia }));
  }
  return {
    meta: {
      modelo: llm.model,
      prompt_versao: VERSAO_PROMPT,
      k,
      limiarEvidencia,
      data: new Date().toISOString(),
    },
    resumo: resumir(perguntas),
    perguntas,
  };
}

function statusDaMetrica(metrica, antes, depois, tolerancia) {
  if (antes === null && depois === null) {
    return 'igual';
  }
  if (depois === null) {
    return 'piorou';
  }
  if (antes === null) {
    return 'melhorou';
  }
  const delta = depois - antes;
  if (Math.abs(delta) <= tolerancia) {
    return 'igual';
  }
  const subiu = delta > 0;
  return subiu !== MENOR_E_MELHOR.has(metrica) ? 'melhorou' : 'piorou';
}

/** Compara dois relatórios (mesmo dataset): métrica a métrica, apontando regressões acima da tolerância. */
function compararRelatorios(antes, depois, { tolerancia = TOLERANCIA_PADRAO } = {}) {
  const metricas = {};
  for (const metrica of METRICAS) {
    const a = antes.resumo[metrica] ?? null;
    const d = depois.resumo[metrica] ?? null;
    metricas[metrica] = {
      antes: a,
      depois: d,
      delta: a !== null && d !== null ? d - a : null,
      status: statusDaMetrica(metrica, a, d, tolerancia),
    };
  }
  const regressoes = METRICAS.filter(m => metricas[m].status === 'piorou');
  return { metas: { antes: antes.meta ?? {}, depois: depois.meta ?? {} }, metricas, regressoes };
}

function descreverProblema(p) {
  if (p.malformada) {
    return `- ${p.id}: resposta fora do contrato`;
  }
  const partes = [];
  if (!p.recusa_correta) {
    partes.push('recusa incorreta');
  }
  if (p.motivos.length) {
    partes.push(p.motivos.join(', '));
  }
  if (p.numeros_inventados.length) {
    partes.push(`valores inventados: ${p.numeros_inventados.join(', ')}`);
  }
  if (p.termos_acusatorios.length) {
    partes.push(`termos acusatórios: ${p.termos_acusatorios.join(', ')}`);
  }
  return partes.length ? `- ${p.id}: ${partes.join(' · ')}` : null;
}

function formatarRelatorioGeracao({ meta, resumo, perguntas }) {
  const linhas = [
    `## Eval de geração — ${meta?.modelo ?? '?'} · ${meta?.prompt_versao ?? '?'}`,
    ...METRICAS.map(m => `- ${m}: ${formatar(resumo[m])}`),
    `- perguntas: ${resumo.n} (${resumo.n_respondidas} respondidas, ${resumo.n_com_fatos} com fatos obrigatórios)`,
  ];
  const problemas = perguntas.map(descreverProblema).filter(Boolean);
  if (problemas.length) {
    linhas.push('', '### Perguntas com problema', ...problemas);
  }
  return linhas.join('\n');
}

function formatarComparacao({ metas, metricas, regressoes }) {
  const rotulo = m => `${m.modelo ?? '?'} · ${m.prompt_versao ?? '?'}`;
  const linhas = [
    `## Antes (${rotulo(metas.antes)}) → Depois (${rotulo(metas.depois)})`,
    '',
    '| métrica | antes | depois | delta | status |',
    '|---|---:|---:|---:|---|',
    ...METRICAS.map(m => {
      const x = metricas[m];
      return `| ${m} | ${formatar(x.antes)} | ${formatar(x.depois)} | ${formatar(x.delta)} | ${x.status} |`;
    }),
    '',
    regressoes.length ? `Regressões: ${regressoes.join(', ')}` : 'Sem regressões.',
  ];
  return linhas.join('\n');
}

module.exports = {
  rodarEvalGeracao,
  compararRelatorios,
  formatarRelatorioGeracao,
  formatarComparacao,
  MINIMOS_GERACAO,
  MAXIMOS_GERACAO,
  METRICAS,
};
