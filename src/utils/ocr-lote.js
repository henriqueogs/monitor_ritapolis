'use strict';

// Funções puras do fluxo OCR em lote: OCR roda numa máquina com recursos
// (exporta JSON) e a produção só aplica o texto, depois de revalidar cada linha.

const MIN_CHARS_OCR = 200;
const MIN_CHARS_TEXTO_EXISTENTE = 50;

function montarListagemImagem({ fonte, tipo, limite } = {}) {
  const filtros = ["status_coleta = 'imagem'", "url_pdf IS NOT NULL AND url_pdf != ''"];
  const params = [];
  if (fonte) {
    filtros.push('fonte = ?');
    params.push(fonte);
  }
  if (tipo) {
    filtros.push('tipo = ?');
    params.push(tipo);
  }
  const n = Number(limite);
  const limitClause = Number.isInteger(n) && n > 0 ? ` LIMIT ${n}` : '';
  const sql = `SELECT id, tipo, ano, url_pdf FROM documentos WHERE ${filtros.join(' AND ')} ORDER BY ano DESC, id${limitClause}`;
  return { sql, params };
}

/** Motivo para NÃO aplicar um texto exportado, ou null se pode aplicar. */
function motivoRecusaImportacao(item, doc) {
  if (!doc) { return 'documento_inexistente'; }
  if (doc.url_pdf !== item.url_pdf) { return 'url_divergente'; }
  if (doc.status_coleta !== 'imagem') { return 'nao_e_imagem'; }
  if ((doc.texto_completo || '').trim().length >= MIN_CHARS_TEXTO_EXISTENTE) { return 'ja_tem_texto'; }
  if ((item.texto || '').trim().length < MIN_CHARS_OCR) { return 'texto_curto'; }
  return null;
}

/**
 * O OCR roda sobre um snapshot cujos ids diferem dos do ambiente de destino:
 * a identidade estável é a url_pdf. Recebe as linhas {id} com essa URL.
 */
function escolherPorUrl(candidatos) {
  if (candidatos.length === 0) { return { motivo: 'documento_inexistente' }; }
  if (candidatos.length > 1) { return { motivo: 'url_ambigua' }; }
  return candidatos[0];
}

module.exports = { MIN_CHARS_OCR, montarListagemImagem, motivoRecusaImportacao, escolherPorUrl };
