'use strict';

/** Repositório: sessões da Câmara extraídas das atas (presenças, votações e votos nominais). */

const { db } = require('./connection');

const TIPOS_ATA = ['ata_ordinaria', 'ata_extraordinaria'];
const TEXTO_MINIMO = 300;
const SITUACAO = {
  PRESENTE: 'presente',
  AUSENTE_JUSTIFICADA: 'ausente_justificada',
  AUSENTE: 'ausente',
};
const STATUS_INVALIDA = 'invalida';
const marcadores = TIPOS_ATA.map(() => '?').join(', ');

/** Atas com texto, com o hash e a versão da extração já gravada (null se nunca extraída). */
function listarAtasComTexto() {
  return db
    .prepare(
      `SELECT d.id, d.tipo, d.numero, d.ano, d.titulo, d.texto_completo,
              s.texto_hash, s.versao_extrator
         FROM documentos d
         LEFT JOIN camara_sessoes s ON s.documento_id = d.id
        WHERE d.fonte = 'camara' AND d.tipo IN (${marcadores})
          AND length(COALESCE(d.texto_completo, '')) >= ?
        ORDER BY COALESCE(d.data_publicacao, '') DESC, d.id DESC`
    )
    .all(...TIPOS_ATA, TEXTO_MINIMO);
}

function gravarPresencas(documentoId, sessao) {
  const inserir = db.prepare(
    'INSERT OR IGNORE INTO camara_sessao_presencas (documento_id, nome, situacao) VALUES (?, ?, ?)'
  );
  for (const nome of sessao.presentes) {
    inserir.run(documentoId, nome, SITUACAO.PRESENTE);
  }
  for (const { nome, justificada } of sessao.ausentes) {
    inserir.run(documentoId, nome, justificada ? SITUACAO.AUSENTE_JUSTIFICADA : SITUACAO.AUSENTE);
  }
}

function gravarVotacoes(documentoId, votacoes) {
  const inserirVotacao = db.prepare(
    `INSERT INTO camara_sessao_votacoes
       (documento_id, ordem, materia, descricao, resultado, votos_favoraveis, votos_contrarios,
        abstencoes, trecho)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const inserirVoto = db.prepare(
    'INSERT OR IGNORE INTO camara_sessao_votos (votacao_id, nome, voto) VALUES (?, ?, ?)'
  );
  votacoes.forEach((v, ordem) => {
    const { lastInsertRowid } = inserirVotacao.run(
      documentoId,
      ordem,
      v.materia,
      v.descricao ?? null,
      v.resultado,
      v.votos_favoraveis ?? null,
      v.votos_contrarios ?? null,
      v.abstencoes ?? null,
      v.trecho
    );
    for (const { nome, voto } of v.nominais || []) {
      inserirVoto.run(lastInsertRowid, nome, voto);
    }
  });
}

/** Troca tudo o que havia da sessão (tudo ou nada). */
function salvarSessao({ documentoId, sessao, avisos, status, modelo, textoHash, versaoExtrator }) {
  db.exec('SAVEPOINT sessao_camara');
  try {
    db.prepare('DELETE FROM camara_sessoes WHERE documento_id = ?').run(documentoId);
    db.prepare(
      `INSERT INTO camara_sessoes
         (documento_id, data_sessao, presidente, texto_hash, versao_extrator, modelo,
          status_validacao, avisos_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      documentoId,
      sessao.data_sessao ?? null,
      sessao.presidente ?? null,
      textoHash,
      versaoExtrator,
      modelo ?? null,
      status,
      JSON.stringify(avisos || [])
    );
    gravarPresencas(documentoId, sessao);
    gravarVotacoes(documentoId, sessao.votacoes);
    db.exec('RELEASE sessao_camara');
  } catch (err) {
    db.exec('ROLLBACK TO sessao_camara; RELEASE sessao_camara');
    throw err;
  }
}

function votacoesDaSessao(documentoId) {
  const votos = db.prepare('SELECT nome, voto FROM camara_sessao_votos WHERE votacao_id = ?');
  return db
    .prepare('SELECT * FROM camara_sessao_votacoes WHERE documento_id = ? ORDER BY ordem')
    .all(documentoId)
    .map((votacao) => ({ ...votacao, nominais: votos.all(votacao.id) }));
}

/** Sessão completa, com a origem (ata) junto. null se a ata não foi extraída. */
function getSessao(documentoId) {
  const sessao = db
    .prepare(
      `SELECT s.*, d.tipo, d.numero, d.ano, d.titulo, d.url_origem, d.url_pdf, d.data_publicacao
         FROM camara_sessoes s JOIN documentos d ON d.id = s.documento_id
        WHERE s.documento_id = ?`
    )
    .get(Number(documentoId));
  if (!sessao) {
    return null;
  }
  const { avisos_json: avisosJson, ...resto } = sessao;
  return {
    ...resto,
    avisos: JSON.parse(avisosJson),
    presencas: db
      .prepare(
        'SELECT nome, situacao FROM camara_sessao_presencas WHERE documento_id = ? ORDER BY nome'
      )
      .all(sessao.documento_id),
    votacoes: votacoesDaSessao(sessao.documento_id),
  };
}

/** Sessões publicáveis (exclui as que não passaram na conferência), mais recente primeiro. */
function listarSessoes() {
  return db
    .prepare(
      `SELECT s.documento_id, s.data_sessao, s.presidente, s.status_validacao,
              d.tipo, d.numero, d.ano, d.titulo, d.url_origem, d.url_pdf,
              (SELECT COUNT(*) FROM camara_sessao_presencas p
                WHERE p.documento_id = s.documento_id AND p.situacao = ?) AS presentes,
              (SELECT COUNT(*) FROM camara_sessao_votacoes v
                WHERE v.documento_id = s.documento_id) AS votacoes
         FROM camara_sessoes s JOIN documentos d ON d.id = s.documento_id
        WHERE s.status_validacao <> ?
        ORDER BY COALESCE(s.data_sessao, '') DESC, s.documento_id DESC`
    )
    .all(SITUACAO.PRESENTE, STATUS_INVALIDA);
}

function listarIdsDeSessoes() {
  return db
    .prepare('SELECT documento_id FROM camara_sessoes ORDER BY documento_id')
    .all()
    .map((linha) => linha.documento_id);
}

/** Todas as presenças das sessões publicáveis, para frequência por pessoa. */
function listarPresencas() {
  return db
    .prepare(
      `SELECT p.nome, p.situacao, s.documento_id, s.data_sessao, d.tipo, d.numero, d.ano
         FROM camara_sessao_presencas p
         JOIN camara_sessoes s ON s.documento_id = p.documento_id
         JOIN documentos d ON d.id = s.documento_id
        WHERE s.status_validacao <> ? AND s.data_sessao IS NOT NULL
        ORDER BY s.data_sessao`
    )
    .all(STATUS_INVALIDA);
}

/** Votos nominais das sessões publicáveis, com a votação e a ata de onde vieram. */
function listarVotosNominais() {
  return db
    .prepare(
      `SELECT vt.nome, vt.voto, v.id AS votacao_id, v.materia, v.descricao, v.resultado,
              v.votos_favoraveis, v.votos_contrarios, v.abstencoes, v.trecho,
              s.documento_id, s.data_sessao, d.url_pdf, d.url_origem
         FROM camara_sessao_votos vt
         JOIN camara_sessao_votacoes v ON v.id = vt.votacao_id
         JOIN camara_sessoes s ON s.documento_id = v.documento_id
         JOIN documentos d ON d.id = s.documento_id
        WHERE s.status_validacao <> ?
        ORDER BY COALESCE(s.data_sessao, '') DESC, v.ordem`
    )
    .all(STATUS_INVALIDA);
}

/** Quantas atas de sessão têm texto, quantas viraram sessão publicável e a data da última. */
function contarCobertura() {
  return db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM documentos
           WHERE fonte = 'camara' AND tipo IN (${marcadores})
             AND length(COALESCE(texto_completo, '')) >= ?) AS atas_com_texto,
         (SELECT COUNT(*) FROM camara_sessoes WHERE status_validacao <> ?) AS sessoes_publicadas,
         (SELECT MAX(data_sessao) FROM camara_sessoes WHERE status_validacao <> ?) AS ultima_sessao`
    )
    .get(...TIPOS_ATA, TEXTO_MINIMO, STATUS_INVALIDA, STATUS_INVALIDA);
}

/** Todas as votações publicáveis, com votos nominais e a ata de origem. */
function listarVotacoes() {
  const votos = db.prepare('SELECT nome, voto FROM camara_sessao_votos WHERE votacao_id = ?');
  return db
    .prepare(
      `SELECT v.id, v.materia, v.descricao, v.resultado, v.votos_favoraveis, v.votos_contrarios,
              v.abstencoes, v.trecho, s.documento_id, s.data_sessao, d.url_pdf, d.url_origem
         FROM camara_sessao_votacoes v
         JOIN camara_sessoes s ON s.documento_id = v.documento_id
         JOIN documentos d ON d.id = s.documento_id
        WHERE s.status_validacao <> ? AND s.data_sessao IS NOT NULL
        ORDER BY s.data_sessao DESC, v.ordem`
    )
    .all(STATUS_INVALIDA)
    .map((votacao) => ({ ...votacao, nominais: votos.all(votacao.id) }));
}

module.exports = {
  SITUACAO,
  contarCobertura,
  listarVotacoes,
  listarAtasComTexto,
  salvarSessao,
  getSessao,
  listarSessoes,
  listarIdsDeSessoes,
  listarPresencas,
  listarVotosNominais,
};
