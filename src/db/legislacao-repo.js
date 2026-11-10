'use strict';

/** Leitura do acervo de leis e normas para a vertente de legislação (somente leitura). */

const { db } = require('./connection');

const TIPOS_NORMA = ['lei_ordinaria', 'lei_complementar', 'decreto', 'portaria', 'resolucao'];

function listarLeisOrdinarias() {
  return db
    .prepare(
      `SELECT id, tipo, numero, ano, data_publicacao, url_origem
         FROM documentos
        WHERE tipo = 'lei_ordinaria' AND numero IS NOT NULL AND ano IS NOT NULL`
    )
    .all();
}

function listarNormasComTexto({ anoMin = 0 } = {}) {
  const marcas = TIPOS_NORMA.map(() => '?').join(',');
  return db
    .prepare(
      `SELECT id, tipo, numero, ano, url_origem, texto_completo
         FROM documentos
        WHERE tipo IN (${marcas}) AND ano >= ? AND texto_completo IS NOT NULL`
    )
    .all(...TIPOS_NORMA, anoMin);
}

module.exports = { listarLeisOrdinarias, listarNormasComTexto };
