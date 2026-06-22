'use strict';

const config = require('../config');
const logger = require('../logger');
const { createAiProvider } = require('./providers');
const { buildAlertNarrativePrompt } = require('./prompts/alert-narrative-prompt');
const { AlertNarrativeContract } = require('./contracts/alert-narrative-contract');

function ensureAiEnabled() {
  if (!config.aiSummaryEnabled) {
    throw new Error('AI_SUMMARY_ENABLED=false; narrativa de alerta desativada');
  }
}

function extractJsonObject(raw) {
  const text = String(raw || '').trim();
  if (!text) {
    throw new Error('Resposta vazia da IA');
  }
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      throw new Error('Resposta da IA nao contem JSON valido');
    }
    return JSON.parse(text.slice(start, end + 1));
  }
}

function validateNarrative(value) {
  const parsed = AlertNarrativeContract.safeParse(value);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'raiz'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Narrativa de alerta fora do contrato: ${issues}`);
  }
  return parsed.data;
}

// Gera narrativa IA para um alerta temático agregado.
// Retorna { titulo, narrativa, questionamentos }.
async function gerarNarrativaAlerta(alerta, { provider } = {}) {
  ensureAiEnabled();
  const aiProvider = provider || createAiProvider();

  const prompt = buildAlertNarrativePrompt({
    categoria: alerta.categoria,
    ano: alerta.ano ?? null,
    documentos: alerta.documentos || [],
    valor_total: alerta.valor_total ?? null,
    valor_periodo_label: alerta.valor_periodo_label ?? null,
    periodo_inicio: alerta.periodo_inicio ?? null,
    periodo_fim: alerta.periodo_fim ?? null,
    questionamentos: alerta.questionamentos || [],
    sinais: alerta.metadados?.sinais || [],
    motivos: alerta.metadados?.motivos || [],
  });

  const rawResponse = await aiProvider.generateJson({ prompt, temperature: 0.2 });
  const validated = validateNarrative(extractJsonObject(rawResponse));

  logger.info('Narrativa de alerta gerada', {
    categoria: alerta.categoria,
    ano: alerta.ano,
    provider: aiProvider.provider,
    modelo: aiProvider.model,
    questionamentos: validated.questionamentos.length,
  });

  return validated;
}

module.exports = { gerarNarrativaAlerta, validateNarrative, extractJsonObject };
