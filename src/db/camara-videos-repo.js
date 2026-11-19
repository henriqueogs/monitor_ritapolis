'use strict';

/** Repositório: vídeos das sessões da Câmara e a transcrição de cada um, em trechos. */

const { db } = require('./connection');

const STATUS_TRANSCRICAO = { PENDENTE: 'pendente', OK: 'ok', SEM_LEGENDA: 'sem_legenda' };

const upsertVideoStmt = db.prepare(`
  INSERT INTO camara_videos (video_id, titulo, tipo, numero, publicado_em)
  VALUES (@video_id, @titulo, @tipo, @numero, @publicado_em)
  ON CONFLICT (video_id) DO UPDATE SET
    titulo = excluded.titulo,
    tipo = excluded.tipo,
    numero = excluded.numero,
    publicado_em = excluded.publicado_em,
    atualizado_em = CURRENT_TIMESTAMP
  WHERE titulo IS NOT excluded.titulo OR tipo IS NOT excluded.tipo
    OR numero IS NOT excluded.numero OR publicado_em IS NOT excluded.publicado_em
`);

/** @returns {'inserted'|'updated'|'unchanged'|null} */
function upsertVideo({ videoId, titulo, tipo, numero, publicadoEm }) {
  if (!videoId || !titulo || !publicadoEm) {
    return null;
  }
  const existente = db.prepare('SELECT 1 FROM camara_videos WHERE video_id = ?').get(videoId);
  const resultado = upsertVideoStmt.run({
    video_id: videoId,
    titulo,
    tipo: tipo || 'outro',
    numero: numero ?? null,
    publicado_em: publicadoEm,
  });
  if (!existente) {
    return 'inserted';
  }
  return resultado.changes ? 'updated' : 'unchanged';
}

function listarVideos() {
  return db
    .prepare(
      `SELECT v.video_id, v.titulo, v.tipo, v.numero, v.publicado_em, v.status_transcricao,
              v.origem_transcricao,
              (SELECT COUNT(*) FROM camara_video_trechos t WHERE t.video_id = v.video_id) AS trechos
         FROM camara_videos v
        ORDER BY v.publicado_em DESC`
    )
    .all();
}

function listarVideosPendentes() {
  return db
    .prepare(
      `SELECT video_id, titulo, publicado_em FROM camara_videos
        WHERE status_transcricao = ? ORDER BY publicado_em DESC`
    )
    .all(STATUS_TRANSCRICAO.PENDENTE);
}

/** Troca a transcrição inteira do vídeo (tudo ou nada). */
function salvarTranscricao({ videoId, trechos, origem }) {
  if (!trechos?.length) {
    throw new Error(`transcrição vazia para o vídeo ${videoId}`);
  }
  if (!db.prepare('SELECT 1 FROM camara_videos WHERE video_id = ?').get(videoId)) {
    throw new Error(`vídeo desconhecido: ${videoId} (colete o feed antes)`);
  }
  const inserir = db.prepare(
    'INSERT INTO camara_video_trechos (video_id, inicio_seg, texto) VALUES (?, ?, ?)'
  );
  db.exec('SAVEPOINT transcricao_video');
  try {
    db.prepare('DELETE FROM camara_video_trechos WHERE video_id = ?').run(videoId);
    for (const trecho of trechos) {
      inserir.run(videoId, trecho.inicioSeg, trecho.texto);
    }
    db.prepare(
      `UPDATE camara_videos
          SET status_transcricao = ?, origem_transcricao = ?, transcrito_em = CURRENT_TIMESTAMP,
              atualizado_em = CURRENT_TIMESTAMP
        WHERE video_id = ?`
    ).run(STATUS_TRANSCRICAO.OK, origem, videoId);
    db.exec('RELEASE transcricao_video');
  } catch (err) {
    db.exec('ROLLBACK TO transcricao_video; RELEASE transcricao_video');
    throw err;
  }
}

function marcarSemLegenda(videoId) {
  db.prepare(
    'UPDATE camara_videos SET status_transcricao = ?, atualizado_em = CURRENT_TIMESTAMP WHERE video_id = ?'
  ).run(STATUS_TRANSCRICAO.SEM_LEGENDA, videoId);
}

function getVideoComTrechos(videoId) {
  const video = db.prepare('SELECT * FROM camara_videos WHERE video_id = ?').get(videoId);
  if (!video) {
    return null;
  }
  const trechos = db
    .prepare(
      'SELECT inicio_seg, texto FROM camara_video_trechos WHERE video_id = ? ORDER BY inicio_seg'
    )
    .all(videoId);
  return { ...video, trechos };
}

module.exports = {
  STATUS_TRANSCRICAO,
  upsertVideo,
  listarVideos,
  listarVideosPendentes,
  salvarTranscricao,
  marcarSemLegenda,
  getVideoComTrechos,
};
