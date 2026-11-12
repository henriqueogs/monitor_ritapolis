'use strict';

/**
 * Leitura dos editais com seus resumos de IA e gravação das datas/valores promovidos. A regra de
 * o que promover fica em src/licitacoes/promover-resumo.js; aqui só há SQL. Cada UPDATE só toca
 * coluna ainda vazia, então rodar duas vezes não sobrescreve nada.
 */

const { db } = require('./connection');

function listarEditaisComResumos() {
  const documentos = db
    .prepare(
      `SELECT d.id, d.ano, d.texto_completo, d.data_abertura, d.valor_estimado,
              l.data_homologacao
         FROM documentos d
         LEFT JOIN licitacoes_detalhes l ON l.documento_id = d.id
        WHERE d.tipo IN ('edital', 'licitacao') AND d.texto_completo IS NOT NULL`
    )
    .all();
  const resumos = db.prepare(
    `SELECT documento_id, resumo_json FROM documentos_resumos_ai
        WHERE status = 'ok' AND documento_id = ? ORDER BY id DESC`
  );
  return documentos.map(d => ({
    documento: d,
    resumos: resumos.all(d.id).map(r => {
      try {
        return JSON.parse(r.resumo_json);
      } catch {
        return null;
      }
    }),
  }));
}

function gravarPromocao(documentoId, campos) {
  let alteradas = 0;
  if (campos.data_abertura) {
    alteradas += Number(
      db
        .prepare('UPDATE documentos SET data_abertura = ? WHERE id = ? AND data_abertura IS NULL')
        .run(campos.data_abertura, documentoId).changes
    );
  }
  if (campos.valor_estimado) {
    alteradas += Number(
      db
        .prepare(
          'UPDATE documentos SET valor_estimado = ? WHERE id = ? AND (valor_estimado IS NULL OR valor_estimado = 0)'
        )
        .run(campos.valor_estimado, documentoId).changes
    );
  }
  if (campos.data_homologacao) {
    alteradas += Number(
      db
        .prepare(
          'UPDATE licitacoes_detalhes SET data_homologacao = ? WHERE documento_id = ? AND data_homologacao IS NULL'
        )
        .run(campos.data_homologacao, documentoId).changes
    );
  }
  return alteradas;
}

module.exports = { listarEditaisComResumos, gravarPromocao };
