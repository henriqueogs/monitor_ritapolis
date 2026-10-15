'use strict';

/**
 * Eval de RECUPERAÇÃO (offline, sem LLM): roda o dataset ouro contra um recuperador e mede
 * recall@k e MRR por documento; perguntas "deve recusar" passam quando nada recuperado
 * atinge o limiar de evidência. ADR 0006.
 *
 * dataset: { id, pergunta, fontes_esperadas: docId[], filtros?, deve_recusar? }[]
 * recuperar(pergunta, { k, filtros }) → [{ docId, score, ... }]
 */

const { recallAtK, reciprocalRank, media } = require('./metricas');

const K_PADRAO = 5;
const LIMIAR_EVIDENCIA_PADRAO = 0.2;
const CASAS = 3;

const unicos = lista => [...new Set(lista)];
const TIPO = Object.freeze({ RECUPERACAO: 'recuperacao', RECUSA: 'recusa' });
const formatar = v => (v === null || v === undefined ? 'n/d' : v.toFixed(CASAS));

function avaliarRecusa(item, resultados, limiarEvidencia) {
  const melhor = Math.max(0, ...resultados.map(r => r.score));
  return { id: item.id, tipo: TIPO.RECUSA, correta: melhor < limiarEvidencia, melhorScore: melhor };
}

function avaliarRecuperacao(item, resultados, k) {
  const docIds = unicos(resultados.map(r => r.docId));
  return {
    id: item.id,
    tipo: TIPO.RECUPERACAO,
    recall: recallAtK(item.fontes_esperadas, docIds, k),
    rr: reciprocalRank(item.fontes_esperadas, docIds),
    docIds,
  };
}

function resumir(perguntas) {
  const recup = perguntas.filter(p => p.tipo === TIPO.RECUPERACAO);
  const recusas = perguntas.filter(p => p.tipo === TIPO.RECUSA);
  return {
    n_recuperacao: recup.length,
    recall_medio: media(recup.map(p => p.recall)),
    mrr: media(recup.map(p => p.rr)),
    n_recusa: recusas.length,
    recusa_correta_pct: recusas.length
      ? recusas.filter(p => p.correta).length / recusas.length
      : null,
  };
}

async function rodarEvalRecuperacao({
  dataset,
  recuperar,
  k = K_PADRAO,
  limiarEvidencia = LIMIAR_EVIDENCIA_PADRAO,
}) {
  const perguntas = [];
  for (const item of dataset) {
    const resultados = await recuperar(item.pergunta, { k, filtros: item.filtros });
    perguntas.push(
      item.deve_recusar
        ? avaliarRecusa(item, resultados, limiarEvidencia)
        : avaliarRecuperacao(item, resultados, k)
    );
  }
  return { perguntas, resumo: resumir(perguntas) };
}

/**
 * Gate: cada métrica precisa existir e respeitar o mínimo (`minimos`) ou o máximo (`maximos`).
 * Falta de dado reprova: sem medição não há aprovação.
 */
function verificarLimiares(resumo, minimos = {}, maximos = {}) {
  const ausente = v => v === null || v === undefined;
  const falhasMinimos = Object.entries(minimos)
    .filter(([metrica, minimo]) => ausente(resumo[metrica]) || resumo[metrica] < minimo)
    .map(([metrica, minimo]) => `${metrica}: ${resumo[metrica] ?? 'ausente'} < ${minimo}`);
  const falhasMaximos = Object.entries(maximos)
    .filter(([metrica, maximo]) => ausente(resumo[metrica]) || resumo[metrica] > maximo)
    .map(([metrica, maximo]) => `${metrica}: ${resumo[metrica] ?? 'ausente'} > ${maximo}`);
  const falhas = [...falhasMinimos, ...falhasMaximos];
  return { passou: falhas.length === 0, falhas };
}

function descreverFalha(p) {
  if (p.tipo === TIPO.RECUSA) {
    return `- ${p.id}: melhor score ${formatar(p.melhorScore)} (deveria recusar)`;
  }
  return `- ${p.id}: recall ${formatar(p.recall)}, docs ${p.docIds.join(', ') || '—'}`;
}

const falhou = p => (p.tipo === TIPO.RECUSA ? !p.correta : p.recall !== null && p.recall < 1);

function formatarRelatorio({ resumo, perguntas }) {
  const linhas = [
    '## Eval de recuperação',
    `- recall_medio: ${formatar(resumo.recall_medio)} · mrr: ${formatar(resumo.mrr)} · recusa_correta: ${formatar(resumo.recusa_correta_pct)}`,
    `- perguntas: ${resumo.n_recuperacao} de recuperação, ${resumo.n_recusa} de recusa`,
  ];
  const erradas = perguntas.filter(falhou);
  if (erradas.length) {
    linhas.push('', '### Perguntas com falha', ...erradas.map(descreverFalha));
  }
  return linhas.join('\n');
}

module.exports = {
  rodarEvalRecuperacao,
  verificarLimiares,
  formatarRelatorio,
  K_PADRAO,
  LIMIAR_EVIDENCIA_PADRAO,
};
