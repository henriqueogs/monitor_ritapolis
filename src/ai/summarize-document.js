const crypto = require('crypto');
const config = require('../config');
const logger = require('../logger');
const {
  getDocumentoById,
  getResumoAiByDocumentoHash,
  saveResumoAi
} = require('../db');
const { estimateTokensFromText } = require('./estimate-tokens');
const { createAiProvider } = require('./providers');
const {
  buildDocumentSummaryPrompt,
  buildConsolidationPrompt
} = require('./prompts/document-summary-prompt');
const { splitTextIntoChunks } = require('./chunk-text');
const { getAiDirectCharLimit } = require('./operation-policy');
const { parseSummaryResponse, validateSummary } = require('./validate-summary');

function buildTextoHash(textoCompleto) {
  return crypto.createHash('sha256').update(String(textoCompleto || ''), 'utf8').digest('hex');
}

function ensureAiEnabled() {
  if (!config.aiSummaryEnabled) {
    throw new Error('AI_SUMMARY_ENABLED=false. Habilite a camada de IA no .env para resumir PDFs.');
  }
}

function getErrorMessage(error) {
  return String(error?.message || error || '');
}

function isRetriableAiError(error) {
  const message = getErrorMessage(error);
  return /timeout|timed out|429|rate limit|too many requests|network|fetch|connect|econn|enotfound|eai_again|etimedout|socket hang up|50[0-9]|bad gateway|service unavailable|gateway timeout/i.test(
    message
  );
}

function getRetryMaxAttempts() {
  return Math.max(1, Number(config.aiRetryMax || 0) + 1);
}

function getMinChunkSizeChars() {
  const configuredMin = Number(config.aiMinChunkSizeChars || 3000);
  const configuredChunk = Number(config.aiChunkSizeChars || 30000);
  return Math.max(1500, Math.min(configuredMin, configuredChunk));
}

function getFallbackChunkSize({ currentSize, textLength }) {
  const minChunkSize = getMinChunkSizeChars();
  const safeCurrentSize = Math.min(Number(currentSize || textLength), textLength);
  return Math.max(minChunkSize, Math.floor(safeCurrentSize / 2));
}

function getFallbackOverlap(chunkSizeChars) {
  const configuredOverlap = Math.max(0, Number(config.aiChunkOverlapChars || 0));
  return Math.min(configuredOverlap, Math.floor(chunkSizeChars * 0.1));
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function truncateText(value, maxChars = 500) {
  const text = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) return null;
  if (text.length <= maxChars) return text;

  return `${text.slice(0, Math.max(1, maxChars - 3)).trim()}...`;
}

function uniqueBy(items, keyFn, maxItems) {
  const seen = new Set();
  const output = [];

  for (const item of items || []) {
    const key = normalizeKey(keyFn(item));
    if (!key || seen.has(key)) continue;

    seen.add(key);
    output.push(item);

    if (output.length >= maxItems) break;
  }

  return output;
}

function compactTextArray(items, maxItems = 8, maxChars = 220) {
  const compacted = (items || [])
    .map((item) => truncateText(item, maxChars))
    .filter(Boolean);

  return uniqueBy(compacted, (item) => item, maxItems);
}

function compactDateItems(items, maxItems = 8) {
  const compacted = (items || [])
    .filter((item) => item?.descricao && item?.trecho_fonte)
    .map((item) => ({
      tipo: item.tipo || 'outro',
      data: item.data || null,
      descricao: truncateText(item.descricao, 180),
      trecho_fonte: truncateText(item.trecho_fonte, 240)
    }));

  return uniqueBy(
    compacted,
    (item) => `${item.tipo}|${item.data || ''}|${item.descricao}|${item.trecho_fonte}`,
    maxItems
  );
}

function compactValueItems(items, maxItems = 8) {
  const compacted = (items || [])
    .filter((item) => Number.isFinite(Number(item?.valor)) && item?.descricao && item?.trecho_fonte)
    .map((item) => ({
      tipo: item.tipo || 'outro',
      valor: Number(item.valor),
      moeda: item.moeda || 'BRL',
      descricao: truncateText(item.descricao, 180),
      trecho_fonte: truncateText(item.trecho_fonte, 240)
    }));

  return uniqueBy(
    compacted,
    (item) => `${item.tipo}|${item.valor}|${item.descricao}|${item.trecho_fonte}`,
    maxItems
  );
}

function compactPartyItems(items, maxItems = 8) {
  const compacted = (items || [])
    .filter((item) => item?.nome && item?.trecho_fonte)
    .map((item) => ({
      nome: truncateText(item.nome, 140),
      papel: item.papel || 'outro',
      documento: truncateText(item.documento, 80),
      trecho_fonte: truncateText(item.trecho_fonte, 240)
    }));

  return uniqueBy(
    compacted,
    (item) => `${item.nome}|${item.papel}|${item.documento || ''}|${item.trecho_fonte}`,
    maxItems
  );
}

function compactRiskItems(items, maxItems = 6) {
  const compacted = (items || [])
    .filter((item) => item?.descricao && item?.motivo)
    .map((item) => ({
      nivel: item.nivel || 'baixo',
      descricao: truncateText(item.descricao, 220),
      motivo: truncateText(item.motivo, 220)
    }));

  return uniqueBy(compacted, (item) => `${item.nivel}|${item.descricao}|${item.motivo}`, maxItems);
}

function compactSummaryForConsolidation(partial) {
  const resumo = partial?.resumo || {};

  return {
    chunk_indice: partial?.chunk_indice,
    tipo_documento: resumo.tipo_documento || 'outro',
    titulo_curto: truncateText(resumo.titulo_curto, 160),
    resumo_cidadao: truncateText(resumo.resumo_cidadao, 500),
    resumo_tecnico: truncateText(resumo.resumo_tecnico, 700),
    pontos_principais: compactTextArray(resumo.pontos_principais, 6, 220),
    datas_relevantes: compactDateItems(resumo.datas_relevantes, 6),
    valores: compactValueItems(resumo.valores, 6),
    partes_envolvidas: compactPartyItems(resumo.partes_envolvidas, 6),
    objeto:
      resumo.objeto && (resumo.objeto.descricao || resumo.objeto.trecho_fonte)
        ? {
            descricao: truncateText(resumo.objeto.descricao, 280),
            trecho_fonte: truncateText(resumo.objeto.trecho_fonte, 240)
          }
        : null,
    riscos_ou_alertas: compactRiskItems(resumo.riscos_ou_alertas, 4),
    campos_nao_encontrados: compactTextArray(resumo.campos_nao_encontrados, 8, 160),
    confianca: Number.isFinite(Number(resumo.confianca)) ? Number(resumo.confianca) : null
  };
}

function chooseMostFrequent(values, fallback = 'outro') {
  const counts = new Map();

  for (const value of values || []) {
    const key = normalizeKey(value);
    if (!key || key === 'outro') continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }

  let selected = fallback;
  let selectedCount = 0;
  for (const [value, count] of counts.entries()) {
    if (count > selectedCount) {
      selected = value;
      selectedCount = count;
    }
  }

  return selected;
}

function averageConfidence(summaries) {
  const values = (summaries || [])
    .map((summary) => Number(summary?.confianca))
    .filter((value) => Number.isFinite(value));

  if (!values.length) return 0.55;

  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Number(Math.min(0.72, Math.max(0.35, average - 0.08)).toFixed(2));
}

function mergePartialSummaries(partialSummaries) {
  const summaries = (partialSummaries || []).map((partial) => partial.resumo).filter(Boolean);
  const title = truncateText(
    summaries.map((summary) => summary.titulo_curto).find(Boolean),
    140
  );
  const citizenSummaries = compactTextArray(
    summaries.map((summary) => summary.resumo_cidadao),
    3,
    420
  );
  const technicalSummaries = compactTextArray(
    summaries.map((summary) => summary.resumo_tecnico),
    5,
    420
  );
  const mainPoints = compactTextArray(
    summaries.flatMap((summary) => summary.pontos_principais || []),
    10,
    220
  );

  const fallbackCitizenSummary = [
    title ? `Documento analisado: ${title}.` : 'Documento publico analisado em partes.',
    mainPoints.length ? `Pontos identificados: ${mainPoints.slice(0, 3).join('; ')}.` : ''
  ]
    .filter(Boolean)
    .join(' ');

  const selectedObject =
    summaries.map((summary) => summary.objeto).find((objeto) => objeto?.descricao || objeto?.trecho_fonte) ||
    {};

  return validateSummary({
    tipo_documento: chooseMostFrequent(
      summaries.map((summary) => summary.tipo_documento),
      summaries[0]?.tipo_documento || 'outro'
    ),
    titulo_curto: title || 'Documento publico municipal',
    resumo_cidadao: truncateText(citizenSummaries.join(' ') || fallbackCitizenSummary, 1200),
    resumo_tecnico: truncateText(technicalSummaries.join(' ') || fallbackCitizenSummary, 1600),
    pontos_principais: mainPoints,
    datas_relevantes: compactDateItems(
      summaries.flatMap((summary) => summary.datas_relevantes || []),
      12
    ),
    valores: compactValueItems(
      summaries.flatMap((summary) => summary.valores || []),
      12
    ),
    partes_envolvidas: compactPartyItems(
      summaries.flatMap((summary) => summary.partes_envolvidas || []),
      12
    ),
    objeto: {
      descricao: truncateText(selectedObject.descricao, 500),
      trecho_fonte: truncateText(selectedObject.trecho_fonte, 300)
    },
    riscos_ou_alertas: compactRiskItems(
      summaries.flatMap((summary) => summary.riscos_ou_alertas || []),
      8
    ),
    campos_nao_encontrados: compactTextArray(
      summaries.flatMap((summary) => summary.campos_nao_encontrados || []),
      12,
      160
    ),
    confianca: averageConfidence(summaries)
  });
}

async function generateValidatedSummary({
  provider,
  prompt,
  temperature = 0,
  maxAttempts = getRetryMaxAttempts(),
  logContext = {}
}) {
  const attempts = Math.max(1, Number(maxAttempts || 1));
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const rawResponse = await provider.generateJson({ prompt, temperature });
      const parsed = parseSummaryResponse(rawResponse);
      const validated = validateSummary(parsed);

      return {
        validated,
        rawResponse
      };
    } catch (error) {
      lastError = error;

      if (!isRetriableAiError(error) || attempt === attempts) {
        throw error;
      }

      const waitMs = Math.min(5000, 750 * attempt);
      logger.warn('Tentativa de resumo IA falhou; tentando novamente', {
        tentativa: attempt,
        maxTentativas: attempts,
        esperaMs: waitMs,
        erro: getErrorMessage(error),
        ...logContext
      });
      await wait(waitMs);
    }
  }

  throw lastError;
}

async function summarizeChunkWithFallback({
  provider,
  texto,
  contratoVersao,
  chunkLabel,
  chunkSizeChars
}) {
  const minChunkSizeChars = getMinChunkSizeChars();
  const prompt = buildDocumentSummaryPrompt({ texto, contratoVersao });

  try {
    const summary = await generateValidatedSummary({
      provider,
      prompt,
      maxAttempts: 1,
      logContext: {
        chunk: chunkLabel,
        caracteresChunk: texto.length
      }
    });

    return [
      {
        chunk_indice: chunkLabel,
        resumo: summary.validated
      }
    ];
  } catch (error) {
    const fallbackChunkSize = getFallbackChunkSize({
      currentSize: chunkSizeChars,
      textLength: texto.length
    });

    if (
      !isRetriableAiError(error) ||
      texto.length <= minChunkSizeChars ||
      fallbackChunkSize >= texto.length
    ) {
      throw error;
    }

    const fallbackOverlap = getFallbackOverlap(fallbackChunkSize);
    const subchunks = splitTextIntoChunks(texto, {
      chunkSizeChars: fallbackChunkSize,
      chunkOverlapChars: fallbackOverlap,
      maxChunksPerDocument: config.aiMaxChunksPerDocument
    });

    if (subchunks.length <= 1) {
      throw error;
    }

    logger.warn('Chunk de resumo IA falhou; reprocessando em subchunks menores', {
      chunk: chunkLabel,
      erro: getErrorMessage(error),
      caracteresChunk: texto.length,
      subchunks: subchunks.length,
      fallbackChunkSizeChars: fallbackChunkSize,
      fallbackChunkOverlapChars: fallbackOverlap
    });

    const summaries = [];
    for (let index = 0; index < subchunks.length; index += 1) {
      const subchunkLabel = `${chunkLabel}.${index + 1}`;
      logger.info('Gerando resumo parcial de subchunk', {
        chunk: chunkLabel,
        subchunk: subchunkLabel,
        subchunkAtual: index + 1,
        subchunksTotal: subchunks.length,
        caracteresSubchunk: subchunks[index].length
      });

      const subSummaries = await summarizeChunkWithFallback({
        provider,
        texto: subchunks[index],
        contratoVersao,
        chunkLabel: subchunkLabel,
        chunkSizeChars: fallbackChunkSize
      });

      summaries.push(...subSummaries);
    }

    return summaries;
  }
}

function ensurePartialSummaryLimit(total) {
  if (total > config.aiMaxChunksPerDocument) {
    throw new Error(
      `Documento excede o limite de ${config.aiMaxChunksPerDocument} chunks para processamento seguro`
    );
  }
}

async function generateChunkedSummary({
  provider,
  texto,
  contratoVersao,
  chunkSizeChars = config.aiChunkSizeChars,
  chunkOverlapChars = config.aiChunkOverlapChars
}) {
  const chunks = splitTextIntoChunks(texto, {
    chunkSizeChars,
    chunkOverlapChars,
    maxChunksPerDocument: config.aiMaxChunksPerDocument
  });

  logger.info('Documento sera resumido em chunks', {
    caracteres: texto.length,
    chunks: chunks.length,
    chunkSizeChars,
    chunkOverlapChars,
    minChunkSizeChars: getMinChunkSizeChars()
  });

  const partialSummaries = [];
  for (let index = 0; index < chunks.length; index += 1) {
    logger.info('Gerando resumo parcial de chunk', {
      chunkAtual: index + 1,
      chunksTotal: chunks.length,
      caracteresChunk: chunks[index].length
    });

    const partials = await summarizeChunkWithFallback({
      provider,
      texto: chunks[index],
      contratoVersao,
      chunkLabel: String(index + 1),
      chunkSizeChars
    });

    partialSummaries.push(...partials);
    ensurePartialSummaryLimit(partialSummaries.length);
  }

  logger.info('Consolidando resumos parciais de documento grande', {
    chunks: partialSummaries.length
  });

  const compactedPartialSummaries = partialSummaries.map(compactSummaryForConsolidation);
  const chunkSummariesJson = JSON.stringify(compactedPartialSummaries);

  const consolidationPrompt = buildConsolidationPrompt({
    contratoVersao,
    chunkSummariesJson
  });

  logger.info('Payload de consolidacao preparado', {
    chunks: compactedPartialSummaries.length,
    caracteresPayload: chunkSummariesJson.length
  });

  try {
    return await generateValidatedSummary({
      provider,
      prompt: consolidationPrompt,
      maxAttempts: 1,
      logContext: {
        etapa: 'consolidacao',
        chunks: compactedPartialSummaries.length,
        caracteresPayload: chunkSummariesJson.length
      }
    });
  } catch (error) {
    if (!isRetriableAiError(error)) {
      throw error;
    }

    logger.warn('Consolidacao final com IA falhou; usando merge deterministico dos resumos parciais', {
      erro: getErrorMessage(error),
      chunks: partialSummaries.length
    });

    return {
      validated: mergePartialSummaries(partialSummaries),
      rawResponse: null
    };
  }
}

async function generateSummaryFromText({ provider, texto, contratoVersao }) {
  const directLimit = getAiDirectCharLimit();

  if (texto.length <= directLimit) {
    const prompt = buildDocumentSummaryPrompt({ texto, contratoVersao });

    try {
      return await generateValidatedSummary({ provider, prompt });
    } catch (error) {
      if (!isRetriableAiError(error) || texto.length <= getMinChunkSizeChars()) {
        throw error;
      }

      const fallbackChunkSize = getFallbackChunkSize({
        currentSize: directLimit,
        textLength: texto.length
      });
      const fallbackOverlap = getFallbackOverlap(fallbackChunkSize);

      logger.warn('Resumo direto falhou; alternando para chunking adaptativo', {
        caracteres: texto.length,
        erro: getErrorMessage(error),
        fallbackChunkSizeChars: fallbackChunkSize,
        fallbackChunkOverlapChars: fallbackOverlap
      });

      return generateChunkedSummary({
        provider,
        texto,
        contratoVersao,
        chunkSizeChars: fallbackChunkSize,
        chunkOverlapChars: fallbackOverlap
      });
    }
  }

  return generateChunkedSummary({
    provider,
    texto,
    contratoVersao
  });
}

function buildResultPayload({ documento, registro, textoHash, reused }) {
  return {
    documento_id: documento.id,
    titulo: documento.titulo,
    provider: registro.provider,
    modelo: registro.modelo,
    contrato_versao: registro.contrato_versao,
    texto_hash: textoHash,
    resumo: registro.resumo_json,
    confianca: registro.resumo_json?.confianca ?? null,
    criado_em: registro.criado_em,
    atualizado_em: registro.atualizado_em,
    reutilizado: reused,
    status: registro.status
  };
}

async function summarizeDocument(documentoId, options = {}) {
  ensureAiEnabled();

  const contratoVersao = options.contratoVersao || config.aiContractVersion;
  const provider = options.provider || createAiProvider();
  const documento = getDocumentoById(documentoId);

  if (!documento) {
    throw new Error(`Documento ${documentoId} nao encontrado`);
  }

  if (!documento.texto_completo) {
    throw new Error(`Documento ${documentoId} nao possui texto_completo para resumir`);
  }

  const textoHash = buildTextoHash(documento.texto_completo);
  const cached = getResumoAiByDocumentoHash(documento.id, textoHash, contratoVersao);
  if (cached?.status === 'ok' && !options.force) {
    return buildResultPayload({
      documento,
      registro: cached,
      textoHash,
      reused: true
    });
  }

  try {
    const summaryResult = await generateSummaryFromText({
      provider,
      texto: documento.texto_completo,
      contratoVersao
    });

    const registro = saveResumoAi({
      documento_id: documento.id,
      provider: provider.provider,
      modelo: provider.model,
      contrato_versao: contratoVersao,
      resumo_json: summaryResult.validated,
      texto_hash: textoHash,
      tokens_estimados: estimateTokensFromText(documento.texto_completo),
      status: 'ok',
      erro: null
    });

    return buildResultPayload({
      documento,
      registro,
      textoHash,
      reused: false
    });
  } catch (error) {
    const shouldPersistError =
      /excede o limite de .* chunks/i.test(error.message) ||
      isRetriableAiError(error);

    if (shouldPersistError) {
      saveResumoAi({
        documento_id: documento.id,
        provider: provider.provider,
        modelo: provider.model,
        contrato_versao: contratoVersao,
        resumo_json: { erro_processamento: error.message },
        texto_hash: textoHash,
        tokens_estimados: estimateTokensFromText(documento.texto_completo),
        status: 'erro',
        erro: error.message
      });
    }

    logger.error('Falha ao resumir documento com IA', {
      documentoId: documento.id,
      provider: provider.provider,
      modelo: provider.model,
      erro: error.message
    });

    throw error;
  }
}

module.exports = {
  summarizeDocument,
  buildTextoHash
};
