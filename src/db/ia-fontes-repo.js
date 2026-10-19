'use strict';

/**
 * Leitura (somente CRUD, sem regra de negócio) das fontes que alimentam o índice de IA:
 * documentos e anexos com texto extraído. Paginação por cursor de id para não carregar o acervo
 * inteiro na RAM da VM (954 MB).
 */

const { db } = require('./connection');

const LIMITE_PADRAO = 25;

function listarDocumentosParaIndexar({ afterId = 0, limite = LIMITE_PADRAO, ano = null } = {}) {
  return db
    .prepare(
      `SELECT id, fonte, tipo, numero, ano, titulo, texto_completo, url_origem, url_pdf, data_publicacao
         FROM documentos
        WHERE id > :afterId
          AND texto_completo IS NOT NULL AND TRIM(texto_completo) <> ''
          AND (:ano IS NULL OR ano = :ano)
        ORDER BY id
        LIMIT :limite`
    )
    .all({ afterId, limite, ano });
}

function listarAnexosParaIndexar({ afterId = 0, limite = LIMITE_PADRAO, ano = null } = {}) {
  return db
    .prepare(
      `SELECT a.id, a.documento_id, a.nome, a.tipo, a.url, a.texto_completo,
              d.ano AS doc_ano, d.tipo AS doc_tipo, d.fonte AS doc_fonte, d.titulo AS doc_titulo
         FROM documentos_anexos a
         JOIN documentos d ON d.id = a.documento_id
        WHERE a.id > :afterId
          AND a.status_extracao = 'ok'
          AND a.texto_completo IS NOT NULL AND TRIM(a.texto_completo) <> ''
          AND (:ano IS NULL OR d.ano = :ano)
        ORDER BY a.id
        LIMIT :limite`
    )
    .all({ afterId, limite, ano });
}

module.exports = { listarDocumentosParaIndexar, listarAnexosParaIndexar };
