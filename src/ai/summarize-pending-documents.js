const config = require('../config');
const {
  listDocumentosPendentesResumoAi,
  getResumoAiByDocumentoHash
} = require('../db');
const { createAiProvider } = require('./providers');
const { summarizeDocument, buildTextoHash } = require('./summarize-document');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function summarizePendingDocuments({
  limite = 20,
  concorrencia = 1,
  maxChars = null,
  minChars = null,
  ano = null,
  tipo = null,
  fonte = null,
  delayBetweenDocsMs = 0,
  dryRun = false
} = {}) {
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
      const cached = getResumoAiByDocumentoHash(documento.id, textoHash, config.aiContractVersion);
      return cached?.status !== 'ok';
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
  const resultados = [];

  // Com delay explícito: processa sequencialmente com pausa entre docs
  if (delayBetweenDocsMs > 0) {
    for (let i = 0; i < documentos.length; i++) {
      const documento = documentos[i];
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
      // Pausa entre docs (exceto após o último)
      if (i < documentos.length - 1) {
        await sleep(delayBetweenDocsMs);
      }
    }
  } else {
    // Sem delay: usa pLimit para concorrência configurável
    const { default: pLimit } = await import('p-limit');
    const limit = pLimit(Math.max(concorrencia, 1));
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
  }

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
