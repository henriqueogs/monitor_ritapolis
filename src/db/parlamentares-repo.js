'use strict';

/** Leituras para o perfil dos parlamentares: cadastro do SGC, proposições e projetos com autor. */

const { db } = require('./connection');

function listarVereadoresComMandatos() {
  const mandatos = db
    .prepare(
      'SELECT int_pes, periodo_inicio, periodo_fim, partido FROM camara_mandatos ORDER BY periodo_inicio DESC'
    )
    .all();
  return db
    .prepare('SELECT int_pes, nome FROM camara_vereadores ORDER BY nome ASC')
    .all()
    .map(v => ({
      ...v,
      mandatos: mandatos
        .filter(m => m.int_pes === v.int_pes)
        .map(({ int_pes: _intPes, ...mandato }) => mandato),
    }));
}

/** Indicações e requerimentos: o autor vem do campo "Autor(es)" da listagem da Câmara. */
function listarProposicoesComAutor() {
  return db
    .prepare(
      `SELECT id, tipo, numero, ano, resumo AS ementa, data_publicacao, url_origem, url_pdf,
              json_extract(dados_extras, '$.autor') AS autor
         FROM documentos
        WHERE fonte = 'camara' AND tipo IN ('indicacao', 'requerimento')
          AND json_extract(dados_extras, '$.autor') IS NOT NULL
        ORDER BY data_publicacao DESC, id ASC`
    )
    .all();
}

function listarProjetosComAutor() {
  return db
    .prepare(
      `SELECT int_prjt, tipo, numero, exercicio, autor_texto, ementa, situacao, anexo_url
         FROM camara_projetos
        WHERE autor_texto IS NOT NULL
        ORDER BY exercicio DESC, CAST(numero AS INTEGER) DESC, int_prjt DESC`
    )
    .all();
}

module.exports = {
  listarVereadoresComMandatos,
  listarProposicoesComAutor,
  listarProjetosComAutor,
};
