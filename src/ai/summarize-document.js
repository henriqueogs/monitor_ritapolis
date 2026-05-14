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

async function generateValidatedSummary({ provider, prompt, temperature = 0.1 }) {
  const rawResponse = await provider.generateJson({ prompt, temperature });
  const parsed = parseSummaryResponse(rawResponse);
  const validated = validateSummary(parsed);

  return {
    validated,
    rawResponse
  };
}

async function generateSummaryFromText({ provider, texto, contratoVersao }) {
  const directLimit = getAiDirectCharLimit();

  if (texto.length <= directLimit) {
    const prompt = buildDocumentSummaryPrompt({ texto, contratoVersao });
    return generateValidatedSummary({ provider, prompt });
  }

  const chunks = splitTextIntoChunks(texto, {
    chunkSizeChars: config.aiChunkSizeChars,
    chunkOverlapChars: config.aiChunkOverlapChars,
    maxChunksPerDocument: config.aiMaxChunksPerDocument
  });

  logger.info('Documento sera resumido em chunks', {
    caracteres: texto.length,
    chunks: chunks.length,
    chunkSizeChars: config.aiChunkSizeChars,
    chunkOverlapChars: config.aiChunkOverlapChars
  });

  const partialSummaries = [];
  for (let index = 0; index < chunks.length; index += 1) {
    logger.info('Gerando resumo parcial de chunk', {
      chunkAtual: index + 1,
      chunksTotal: chunks.length,
      caracteresChunk: chunks[index].length
    });

    const partialPrompt = buildDocumentSummaryPrompt({
      texto: chunks[index],
      contratoVersao
    });

    const partial = await generateValidatedSummary({
      provider,
      prompt: partialPrompt
    });

    partialSummaries.push({
      chunk_indice: index,
      resumo: partial.validated
    });
  }

  logger.info('Consolidando resumos parciais de documento grande', {
    chunks: partialSummaries.length
  });

  const consolidationPrompt = buildConsolidationPrompt({
    contratoVersao,
    chunkSummariesJson: JSON.stringify(partialSummaries)
  });

  return generateValidatedSummary({
    provider,
    prompt: consolidationPrompt
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
      /timeout|timed out/i.test(error.message) ||
      /429/i.test(error.message);

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
