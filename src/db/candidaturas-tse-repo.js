'use strict';

/** Repositório: candidaturas a vereador importadas dos dados abertos do TSE. */

const { db } = require('./connection');

const upsertStmt = db.prepare(`
  INSERT INTO camara_candidaturas_tse (
    sq_candidato, ano_eleicao, numero, nome, nome_urna, partido, votos, situacao, url_origem
  ) VALUES (
    @sq_candidato, @ano_eleicao, @numero, @nome, @nome_urna, @partido, @votos, @situacao, @url_origem
  )
  ON CONFLICT (sq_candidato) DO UPDATE SET
    ano_eleicao = excluded.ano_eleicao,
    numero = excluded.numero,
    nome = excluded.nome,
    nome_urna = excluded.nome_urna,
    partido = excluded.partido,
    votos = excluded.votos,
    situacao = excluded.situacao,
    url_origem = excluded.url_origem,
    atualizado_em = CURRENT_TIMESTAMP
`);
const existeStmt = db.prepare('SELECT 1 FROM camara_candidaturas_tse WHERE sq_candidato = ?');

/** Upsert por SQ_CANDIDATO (id do TSE): reimportar não duplica. */
function salvarCandidaturasTse(candidaturas, { urlOrigem }) {
  if (!urlOrigem) {
    throw new Error('salvarCandidaturasTse: url_origem obrigatória');
  }
  let novos = 0;
  db.exec('BEGIN');
  try {
    for (const c of candidaturas) {
      novos += existeStmt.get(c.sq_candidato) ? 0 : 1;
      upsertStmt.run({ ...c, url_origem: urlOrigem });
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return { novos, atualizados: candidaturas.length - novos };
}

function listarCandidaturasTse() {
  return db
    .prepare(
      `SELECT sq_candidato, ano_eleicao, numero, nome, nome_urna, partido, votos, situacao, url_origem
         FROM camara_candidaturas_tse
        ORDER BY ano_eleicao DESC, votos DESC, nome ASC`
    )
    .all()
    .map(row => ({ ...row }));
}

module.exports = { salvarCandidaturasTse, listarCandidaturasTse };
