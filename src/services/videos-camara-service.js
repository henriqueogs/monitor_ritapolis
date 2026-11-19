'use strict';

/**
 * Vídeos das sessões da Câmara: registra o que o feed do canal lista e cuida da transcrição.
 * A coleta do feed roda em qualquer lugar; a transcrição roda fora da VM e entra por importação.
 */

const {
  STATUS_TRANSCRICAO,
  upsertVideo,
  salvarTranscricao,
  marcarSemLegenda,
  getVideoComTrechos,
} = require('../db/camara-videos-repo');
const { parseFeedYoutube, classificarVideo, montarTrechos } = require('../camara/videos');
const { buscarLegenda: buscarLegendaYoutube } = require('../integracoes/youtube-legendas');

const ORIGEM_TRANSCRICAO = {
  LEGENDA_AUTOMATICA: 'legenda_automatica_youtube',
  LEGENDA: 'legenda_youtube',
};

function registrarVideosDoFeed(xml) {
  const stats = { registros: 0, novos: 0, atualizados: 0 };
  for (const video of parseFeedYoutube(xml)) {
    const acao = upsertVideo({ ...video, ...classificarVideo(video.titulo) });
    stats.registros += 1;
    stats.novos += acao === 'inserted' ? 1 : 0;
    stats.atualizados += acao === 'updated' ? 1 : 0;
  }
  return stats;
}

/** Não toca no banco: serve tanto para gravar direto quanto para exportar em arquivo. */
async function transcreverVideo(videoId, { buscarLegenda = buscarLegendaYoutube } = {}) {
  const legenda = await buscarLegenda(videoId);
  if (!legenda) {
    return { videoId, origem: null, trechos: [] };
  }
  return {
    videoId,
    origem: legenda.automatica
      ? ORIGEM_TRANSCRICAO.LEGENDA_AUTOMATICA
      : ORIGEM_TRANSCRICAO.LEGENDA,
    trechos: montarTrechos(legenda.eventos),
  };
}

/** @param {Array<{videoId, origem, trechos}>} itens saída de transcreverVideo */
function importarTranscricoes(itens) {
  const resumo = { importados: 0, semLegenda: 0, jaTranscritos: 0, desconhecidos: 0 };
  for (const item of itens || []) {
    const video = getVideoComTrechos(item.videoId);
    if (!video) {
      resumo.desconhecidos += 1;
    } else if (video.status_transcricao === STATUS_TRANSCRICAO.OK) {
      resumo.jaTranscritos += 1;
    } else if (!item.trechos?.length) {
      marcarSemLegenda(item.videoId);
      resumo.semLegenda += 1;
    } else {
      salvarTranscricao(item);
      resumo.importados += 1;
    }
  }
  return resumo;
}

module.exports = {
  ORIGEM_TRANSCRICAO,
  registrarVideosDoFeed,
  transcreverVideo,
  importarTranscricoes,
};
