'use strict';

/**
 * Geração de narrativa IA sobre anomalias financeiras detectadas (B2).
 * Recebe os dados estruturados de getEmpenhoAtipicos() e produz um texto
 * em linguagem cidadã explicando o que foi encontrado.
 *
 * Cache simples em memória com TTL de 6h por exercício — evita re-chamadas desnecessárias.
 */

const logger = require('../logger');
const { createAiProvider } = require('./providers');

// Cache em memória: { [exercicio]: { gerado_em, narrativa } }
const cache = new Map();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h

function isCacheValid(entry) {
  return entry && Date.now() - entry.gerado_em < CACHE_TTL_MS;
}

function formatMoney(valor) {
  return `R$ ${Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
}

function buildPrompt(anomalias) {
  const { exercicio, outliers_valor, possivel_fracionamento, total_outliers, total_fracionamento, limiar_dispensa } = anomalias;

  const outliersStr = outliers_valor.slice(0, 5).map((o, i) =>
    `${i + 1}. ${o.credor_nome} | ${o.funcao} | ${formatMoney(o.valor)} | z-score=${o.zscore}σ | empenho ${o.empenho} (${o.data_empenho})`
  ).join('\n');

  const fracStr = possivel_fracionamento.slice(0, 5).map((f, i) =>
    `${i + 1}. ${f.credor_nome} | ${f.n_empenhos} empenhos na semana ${f.semana} | total ${formatMoney(f.valor_semana)}`
  ).join('\n');

  return `Você é um analista de controle interno da Prefeitura de Ritápolis (MG).
Analise os dados financeiros abaixo e escreva um relatório conciso em português, acessível para cidadãos.

EXERCÍCIO: ${exercicio}
LIMIAR DE DISPENSA DE LICITAÇÃO: ${formatMoney(limiar_dispensa)}

== EMPENHOS COM VALOR FORA DO PADRÃO ESTATÍSTICO (${total_outliers} no total) ==
(z-score mede quantos desvios-padrão acima da média da área o empenho está)
${outliersStr || 'Nenhum'}

== POSSÍVEL FRACIONAMENTO DE CONTRATOS (${total_fracionamento} situações) ==
(Mesmo fornecedor, mesma semana, múltiplos empenhos individuais abaixo do limiar de dispensa)
${fracStr || 'Nenhum'}

Escreva:
1. Um parágrafo explicando o que são esses indicadores em linguagem simples.
2. Os 3 casos mais relevantes que merecem atenção do cidadão.
3. Uma conclusão de 2-3 linhas sobre o perfil geral dos gastos.
Seja objetivo. Não invente dados além dos fornecidos. Máximo 350 palavras.`;
}

/**
 * Gera narrativa cidadã sobre as anomalias detectadas.
 * Usa cache de 6h por exercício.
 * @param {object} anomalias — retorno de getEmpenhoAtipicos()
 * @returns {Promise<{ narrativa: string, cached: boolean }>}
 */
async function gerarNarrativaAnomalias(anomalias) {
  const key = String(anomalias.exercicio);
  const cached = cache.get(key);

  if (isCacheValid(cached)) {
    return { narrativa: cached.narrativa, cached: true };
  }

  const semAlertas = anomalias.total_outliers === 0 && anomalias.total_fracionamento === 0;
  if (semAlertas) {
    const narrativa = `Nenhuma anomalia estatisticamente relevante foi detectada nos empenhos de ${anomalias.exercicio}. Os gastos da Prefeitura de Ritápolis neste exercício apresentaram distribuição dentro dos padrões esperados por área funcional.`;
    cache.set(key, { gerado_em: Date.now(), narrativa });
    return { narrativa, cached: false };
  }

  const prompt = buildPrompt(anomalias);
  logger.info('anomaly-narrative: chamando IA', { exercicio: anomalias.exercicio });

  const provider = createAiProvider();
  const response = await provider.client.chat.completions.create({
    model: provider.model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 600,
    temperature: 0.3,
  });

  const narrativa = response?.choices?.[0]?.message?.content?.trim() || 'Não foi possível gerar a narrativa.';
  cache.set(key, { gerado_em: Date.now(), narrativa });

  return { narrativa, cached: false };
}

/**
 * Invalida o cache para um exercício (útil após re-coleta de dados).
 */
function invalidarCache(exercicio) {
  if (exercicio) {cache.delete(String(exercicio));}
  else {cache.clear();}
}

module.exports = { gerarNarrativaAnomalias, invalidarCache };
