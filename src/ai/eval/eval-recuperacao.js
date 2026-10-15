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

const unicos = (lista) => [...new Set(lista)];
const pct = (v) => (v === null ? 'n/d' : v.toFixed(CASAS));

function avaliarRecusa(item, resultados, limiarEvidencia) {
  const melhor = Math.max(0, ...resultados.map((r) => r.score));
  return { id: item.id, tipo: 'recusa', correta: melhor < limiarEvidencia, melhorScore: melhor };
}

function avaliarRecuperacao(item, resultados, k) {
  const docIds = unicos(resultados.map((r) => r.docId));
  return {
    id: item.id,
    tipo: 'recuperacao',
    recall: recallAtK(item.fontes_esperadas, docIds, k),
    rr: reciprocalRank(item.fontes_esperadas, docIds),
    docIds,
  };
}

function resumir(perguntas) {
  const recup = perguntas.filter((p) => p.tipo === 'recuperacao');
  const recusas = perguntas.filter((p) => p.tipo === 'recusa');
  return {
    n_recuperacao: recup.length,
    recall_medio: media(recup.map((p) => p.recall)),
    mrr: media(recup.map((p) => p.rr)),
    n_recusa: recusas.length,
    recusa_correta_pct: recusas.length ? recusas.filter((p) => p.correta).length / recusas.length : null,
  };
}

async function rodarEvalRecuperacao({ dataset, recuperar, k = K_PADRAO, limiarEvidencia = LIMIAR_EVIDENCIA_PADRAO }) {
  const perguntas = [];
  for (const item of dataset) {
    const resultados = await recuperar(item.pergunta, { k, filtros: item.filtros });
    perguntas.push(
      item.deve_recusar ? avaliarRecusa(item, resultados, limiarEvidencia) : avaliarRecuperacao(item, resultados, k)
    );
  }
  return { perguntas, resumo: resumir(perguntas) };
}

/** Gate: cada métrica precisa existir e atingir o mínimo (falta de dado reprova). */
function verificarLimiares(resumo, minimos) {
  const falhas = Object.entries(minimos)
    .filter(([metrica, minimo]) => resumo[metrica] === null || resumo[metrica] === undefined || resumo[metrica] < minimo)
    .map(([metrica, minimo]) => `${metrica}: ${resumo[metrica] ?? 'ausente'} < ${minimo}`);
  return { passou: falhas.length === 0, falhas };
}

function formatarRelatorio({ resumo, perguntas }) {
  const linhas = [
    '## Eval de recuperação',
    `- recall_medio: ${pct(resumo.recall_medio)} · mrr: ${pct(resumo.mrr)} · recusa_correta: ${pct(resumo.recusa_correta_pct)}`,
    `- perguntas: ${resumo.n_recuperacao} de recuperação, ${resumo.n_recusa} de recusa`,
  ];
  const erradas = perguntas.filter((p) => (p.tipo === 'recusa' ? !p.correta : p.recall !== null && p.recall < 1));
  if (erradas.length) {
    linhas.push('', '### Perguntas com falha');
    for (const p of erradas) {linhas.push(`- ${p.id}: ${p.tipo === 'recusa' ? `melhor score ${pct(p.melhorScore)}` : `recall ${pct(p.recall)}, docs ${p.docIds.join(', ') || '—'}`}`);}
  }
  return linhas.join('\n');
}

module.exports = { rodarEvalRecuperacao, verificarLimiares, formatarRelatorio, K_PADRAO, LIMIAR_EVIDENCIA_PADRAO };
