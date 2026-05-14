const config = require('../config');
const {
  listDocumentosPendentesResumoAi,
  getResumoAiByDocumentoHash
} = require('../db');
const { createAiProvider } = require('./providers');
const { summarizeDocument, buildTextoHash } = require('./summarize-document');

async function summarizePendingDocuments({
  limite = 20,
  concorrencia = 1,
  maxChars = null,
  minChars = null,
  ano = null,
  tipo = null,
  fonte = null,
  dryRun = false
} = {}) {
  const { default: pLimit } = await import('p-limit');
  const candidateLimit = Math.max(limite * 20, 200);
  const documentos = listDocumentosPendentesResumoAi({
    limite: candidateLimit,
    contratoVersao: config.aiContractVersion,
    ano,
    tipo,
    fonte
  })
    .filter((documento) => {
      const textoCompleto = documento.texto_completo || '';
      if (maxChars && textoCompleto.length > maxChars) {
        return false;
      }

      if (minChars && textoCompleto.length < minChars) {
        return false;
      }

      const textoHash = buildTextoHash(textoCompleto);
      return !getResumoAiByDocumentoHash(documento.id, textoHash, config.aiContractVersion);
    })
    .slice(0, limite);

  if (dryRun) {
    return {
      dry_run: true,
      filtros: {
        limite,
        concorrencia,
        max_chars: maxChars,
        min_chars: minChars,
        ano,
        tipo,
        fonte
      },
      total_selecionados: documentos.length,
      total_processados: 0,
      total_ok: 0,
      total_erro: 0,
      candidatos: documentos.map((documento) => ({
        documento_id: documento.id,
        ano: documento.ano,
        tipo: documento.tipo,
        fonte: documento.fonte,
        titulo: documento.titulo,
        texto_chars: (documento.texto_completo || '').length
      })),
      resultados: []
    };
  }

  const provider = createAiProvider();

  const limit = pLimit(Math.max(concorrencia, 1));
  const resultados = [];

  await Promise.all(
    documentos.map((documento) =>
      limit(async () => {
        try {
          const result = await summarizeDocument(documento.id, { provider });
          resultados.push({
            documento_id: documento.id,
            status: 'ok',
            reutilizado: result.reutilizado,
            confianca: result.confianca
          });
        } catch (error) {
          resultados.push({
            documento_id: documento.id,
            status: 'erro',
            erro: error.message
          });
        }
      })
    )
  );

  return {
    dry_run: false,
    filtros: {
      limite,
      concorrencia,
      max_chars: maxChars,
      min_chars: minChars,
      ano,
      tipo,
      fonte
    },
    total_selecionados: documentos.length,
    total_processados: resultados.length,
    total_ok: resultados.filter((item) => item.status === 'ok').length,
    total_erro: resultados.filter((item) => item.status === 'erro').length,
    resultados
  };
}

module.exports = {
  summarizePendingDocuments
};
