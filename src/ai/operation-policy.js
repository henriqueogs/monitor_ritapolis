const config = require('../config');
const { splitTextIntoChunks } = require('./chunk-text');

function getAiDirectCharLimit() {
  return Math.min(config.aiMaxCharsDirect, config.aiChunkSizeChars);
}

function classifyAiError(error) {
  const message = String(error || '');
  if (!message) return 'sem_erro';
  if (/timeout|timed out/i.test(message)) return 'timeout';
  if (/429|rate limit|too many requests/i.test(message)) return 'limite_provider';
  if (/contrato|zod|invalid|expected|required/i.test(message)) return 'contrato_invalido';
  if (/api key|unauthorized|401|403/i.test(message)) return 'credencial';
  if (/network|fetch|connect|econn|enotfound|eai_again/i.test(message)) return 'rede';
  if (/chunks/i.test(message)) return 'limite_tamanho';
  return 'outro';
}

function getAiOperationPlan({ texto = '', caracteres = null } = {}) {
  const text = String(texto || '');
  const totalChars = caracteres == null ? text.length : Number(caracteres || 0);
  const directLimit = getAiDirectCharLimit();

  if (!totalChars) {
    return {
      pode_resumir: false,
      motivo: 'Documento sem texto extraido',
      caracteres: 0,
      modo: 'indisponivel',
      chunks_previstos: 0,
      limite_direto_chars: directLimit,
      recomendado_frontend: false
    };
  }

  const precisaChunking = totalChars > directLimit;
  if (!precisaChunking) {
    return {
      pode_resumir: true,
      caracteres: totalChars,
      modo: 'direto',
      chunks_previstos: 0,
      limite_direto_chars: directLimit,
      recomendado_frontend: true
    };
  }

  if (!text) {
    return {
      pode_resumir: true,
      caracteres: totalChars,
      modo: 'chunking',
      chunks_previstos: Math.ceil(totalChars / config.aiChunkSizeChars),
      limite_direto_chars: directLimit,
      recomendado_frontend: false
    };
  }

  try {
    const chunks = splitTextIntoChunks(text, {
      chunkSizeChars: config.aiChunkSizeChars,
      chunkOverlapChars: config.aiChunkOverlapChars,
      maxChunksPerDocument: config.aiMaxChunksPerDocument
    });

    return {
      pode_resumir: true,
      caracteres: totalChars,
      modo: 'chunking',
      chunks_previstos: chunks.length,
      limite_direto_chars: directLimit,
      chunk_size_chars: config.aiChunkSizeChars,
      chunk_overlap_chars: config.aiChunkOverlapChars,
      recomendado_frontend: true
    };
  } catch (error) {
    return {
      pode_resumir: false,
      motivo: error.message,
      caracteres: totalChars,
      modo: 'chunking',
      chunks_previstos: null,
      limite_direto_chars: directLimit,
      chunk_size_chars: config.aiChunkSizeChars,
      chunk_overlap_chars: config.aiChunkOverlapChars,
      recomendado_frontend: false
    };
  }
}

module.exports = {
  classifyAiError,
  getAiDirectCharLimit,
  getAiOperationPlan
};
