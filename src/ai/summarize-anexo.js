'use strict';

// Resumo de anexo via IA real, com fallback heurístico transparente.
// Substitui o antigo resumirAnexoLocal (só "primeira frase >40 chars") como
// caminho principal — o heurístico vira fallback explícito, nunca escondido.

const crypto = require('crypto');
const config = require('../config');
const logger = require('../logger');
const { createAiProvider } = require('./providers');
const { buildAnexoResumoPrompt, MAX_TEXTO_CHARS } = require('./prompts/anexo-resumo-prompt');
const { splitTextIntoChunks } = require('./chunk-text');
const { validateAnexoResumo } = require('./contracts/anexo-resumo-contract');
const { isImageBasedPdf } = require('../parsers/pdf');
const { resumirAnexoLocal } = require('../inteligencia/fatos-extractor');
const { salvarResumoAnexo } = require('../db/inteligencia-fatos-repo');

const CONTRACT_VERSION_IA = 'anexo-2.0';
const CONTRACT_VERSION_FULL_IA = 'anexo-2.1-full';
const CONTRACT_VERSION_HEURISTICO = 'anexo-1.0';

function getAnexoSummaryVersion(texto) {
  return String(texto || '').length > MAX_TEXTO_CHARS
    ? CONTRACT_VERSION_FULL_IA : CONTRACT_VERSION_IA;
}

function textoHash(texto) {
  return crypto.createHash('sha256').update(String(texto || ''), 'utf8').digest('hex');
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

// Gate de qualidade: reaproveita a heurística já usada para decidir se um PDF
// é imagem/ruído de OCR (§ mesma lógica de src/parsers/pdf.js). Texto ruim
// mandado para a IA produz resumo "confiante" mas falso — melhor não tentar.
function textoConfiavelParaIa(texto) {
  return !isImageBasedPdf(texto, 1);
}

function heuristico(anexo, motivo) {
  const resumo = resumirAnexoLocal({ anexo, fatos: [] });
  return {
    contrato_versao: CONTRACT_VERSION_HEURISTICO,
    provider: 'local',
    modelo: 'heuristico-anexo',
    resumo_json: resumo,
    confianca: resumo.confianca,
    erro: motivo || null,
  };
}

async function gerarViaIa(anexo, documento, provider, progress) {
  const version = getAnexoSummaryVersion(anexo.texto_completo);
  const chunkSize = Math.min(MAX_TEXTO_CHARS, Math.max(1000, Number(config.aiChunkSizeChars) || 6000));
  const chunks = version === CONTRACT_VERSION_IA ? [String(anexo.texto_completo)] :
    splitTextIntoChunks(anexo.texto_completo, {
      chunkSizeChars: chunkSize,
      chunkOverlapChars: Math.min(Math.max(0, Number(config.aiChunkOverlapChars) || 0), Math.floor(chunkSize / 10)),
      maxChunksPerDocument: config.aiMaxChunksPerDocument,
    });
  // Bind checkpoints to the ENTIRE input, metadata, model and chunk policy.
  // A prefix shared by two versions of a file is not evidence for that file.
  const input = textoHash(JSON.stringify([version, provider.provider, provider.model,
    anexo.texto_completo, anexo.nome, anexo.tipo,
    [documento?.titulo, documento?.tipo, documento?.ano], chunkSize,
    config.aiChunkOverlapChars]));
  async function validatedRequest(prompt) {
    const step = `anexo-summary:${input}:${textoHash(prompt)}`;
    const saved = progress?.load(step);
    if (saved?.summary) {
      const summary = validateAnexoResumo(saved.summary);
      logger.info('Reutilizando resumo parcial de anexo validado', { anexoId: anexo.id });
      return summary;
    }
    progress?.checkTime();
    const raw = await provider.generateJson({ prompt, temperature: 0.15,
      ...(progress ? { timeoutMs: Math.min(config.aiRequestTimeoutMs, progress.remainingMs()), maxRetries: 0 } : {}),
    });
    const summary = validateAnexoResumo(extractJsonObject(raw));
    progress?.save(step, { summary });
    return summary;
  }
  let summaries = [];
  for (let i = 0; i < chunks.length; i++) {
    summaries.push(await validatedRequest(buildAnexoResumoPrompt({ anexo, documento,
      texto: chunks[i], trecho: chunks.length > 1 ? { indice: i + 1, total: chunks.length } : null,
    })));
  }
  // Bounded tree: every leaf must have completed before publishing a canonical
  // result. A failed consolidation resumes without sending completed text again.
  while (summaries.length > 1) {
    const next = [];
    for (let i = 0; i < summaries.length; i += 3) {
      const group = summaries.slice(i, i + 3);
      if (group.length === 1) {
        next.push(group[0]);
        continue;
      }
      if (JSON.stringify(group).length > 24000) {
        throw new Error('Resumos parciais de anexo excedem o limite seguro de consolidacao');
      }
      next.push(await validatedRequest(buildAnexoResumoPrompt({ anexo, documento, parciais: group })));
    }
    summaries = next;
  }
  const validado = summaries[0];
  return {
    contrato_versao: version,
    provider: provider.provider,
    modelo: provider.model,
    resumo_json: {
      aviso: 'Resumo gerado por IA a partir do texto extraído do anexo.',
      anexo: { nome: anexo.nome || null, tipo: anexo.tipo || null, status_extracao: anexo.status_extracao || null },
      ...validado,
      cobertura: { texto_hash: textoHash(anexo.texto_completo), caracteres: String(anexo.texto_completo).length,
        trechos: chunks.length, completa: true },
    },
    confianca: validado.confianca,
    erro: null,
  };
}

// Resume um anexo: usa IA quando o texto tem qualidade suficiente e
// AI_SUMMARY_ENABLED está ligado; cai para o heurístico local em qualquer
// outro caso (texto ruim, IA desligada, erro/fora-do-contrato) — nunca falha
// silenciosamente, o motivo do fallback fica em `erro`.
async function summarizeAnexo(anexo, options = {}) {
  const hash = textoHash(anexo.texto_completo);
  const cached = anexo.resumo_ai;
  if (!options.force && cached?.texto_hash === hash && cached.contrato_versao === getAnexoSummaryVersion(anexo.texto_completo)
      && cached.status === 'ok' && !cached.erro) {
    try {
      validateAnexoResumo(cached.dados);
      return { id: cached.id, contrato_versao: cached.contrato_versao, texto_hash: hash,
        resumo_json: cached.dados, provider: cached.provider, modelo: cached.modelo,
        confianca: cached.confianca, erro: null, cached: true };
    } catch {
      logger.warn('Resumo de anexo armazenado invalido; precisa regenerar', { anexoId: anexo.id });
    }
  }
  let resultado;

  if (!config.aiSummaryEnabled) {
    resultado = heuristico(anexo, 'AI_SUMMARY_ENABLED=false');
  } else if (!textoConfiavelParaIa(anexo.texto_completo)) {
    resultado = heuristico(anexo, 'texto_baixa_qualidade_ocr');
  } else {
    try {
      const provider = options.provider || createAiProvider();
      resultado = await gerarViaIa(anexo, options.documento, provider, options.progress);
    } catch (err) {
      if (options.progress || err.code === 'PIPELINE_YIELD') {
        throw err;
      }
      logger.warn('Resumo de anexo: fallback heuristico', { anexoId: anexo.id, erro: err.message });
      resultado = heuristico(anexo, err.message);
    }
  }

  if (options.progress && resultado.erro) {
    throw new Error(resultado.erro);
  }

  const registro = salvarResumoAnexo({
    anexo_id: anexo.id,
    provider: resultado.provider,
    modelo: resultado.modelo,
    contrato_versao: resultado.contrato_versao,
    resumo_json: resultado.resumo_json,
    texto_hash: hash,
    confianca: resultado.confianca,
    status: 'ok',
    erro: resultado.erro,
  });

  return { ...resultado, id: registro.id, texto_hash: hash };
}

module.exports = {
  CONTRACT_VERSION_IA,
  CONTRACT_VERSION_FULL_IA,
  CONTRACT_VERSION_HEURISTICO,
  getAnexoSummaryVersion,
  textoConfiavelParaIa,
  summarizeAnexo,
};
