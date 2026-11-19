'use strict';

/**
 * Vídeos das sessões da Câmara no YouTube: leitura do feed do canal, classificação pelo título
 * e montagem da transcrição em trechos com o instante de cada um.
 *
 * A transcrição vem da legenda automática do YouTube: erra nomes próprios e números. Serve para
 * achar o trecho e mandar o leitor ao vídeo, não para citar fala entre aspas.
 */

const cheerio = require('cheerio');

const TIPOS_VIDEO = {
  SESSAO_ORDINARIA: 'sessao_ordinaria',
  SESSAO_EXTRAORDINARIA: 'sessao_extraordinaria',
  AUDIENCIA_PUBLICA: 'audiencia_publica',
  OUTRO: 'outro',
};
const JANELA_TRECHO_SEG = 60;
const MS_POR_SEG = 1000;

/** @returns {Array<{videoId: string, titulo: string, publicadoEm: string}>} */
function parseFeedYoutube(xml) {
  const $ = cheerio.load(String(xml || ''), { xmlMode: true });
  return $('entry')
    .map((_, el) => {
      const entry = $(el);
      return {
        videoId: entry.find('yt\\:videoId').first().text().trim(),
        titulo: entry.find('title').first().text().trim(),
        publicadoEm: entry.find('published').first().text().trim(),
      };
    })
    .get()
    .filter((video) => video.videoId && video.titulo);
}

function classificarVideo(titulo) {
  const texto = String(titulo || '');
  const sessao = texto.match(/^\s*(\d+)\s*[ªaº°]?\s*Sess[ãa]o\s+(Extraordin[áa]ria|Ordin[áa]ria)/i);
  if (sessao) {
    const tipo = /^extra/i.test(sessao[2])
      ? TIPOS_VIDEO.SESSAO_EXTRAORDINARIA
      : TIPOS_VIDEO.SESSAO_ORDINARIA;
    return { tipo, numero: Number(sessao[1]) };
  }
  if (/audi[êe]ncia\s+p[úu]blica/i.test(texto)) {
    return { tipo: TIPOS_VIDEO.AUDIENCIA_PUBLICA, numero: null };
  }
  return { tipo: TIPOS_VIDEO.OUTRO, numero: null };
}

/**
 * Eventos da legenda (formato json3 do YouTube) → blocos de um minuto.
 * @returns {Array<{inicioSeg: number, texto: string}>}
 */
function montarTrechos(eventos, janelaSeg = JANELA_TRECHO_SEG) {
  const trechos = [];
  let atual = null;
  for (const evento of eventos || []) {
    const fala = (evento.segs || []).map((seg) => seg.utf8 || '').join('');
    if (!fala.trim()) {
      continue;
    }
    const inicioSeg = Math.floor(Number(evento.tStartMs || 0) / MS_POR_SEG);
    if (!atual || inicioSeg - atual.inicioSeg >= janelaSeg) {
      atual = { inicioSeg, partes: [] };
      trechos.push(atual);
    }
    atual.partes.push(fala);
  }
  return trechos.map(({ inicioSeg, partes }) => ({
    inicioSeg,
    texto: partes.join('').replace(/\s+/g, ' ').trim(),
  }));
}

function urlNoInstante(urlVideo, inicioSeg) {
  return `${urlVideo}&t=${Math.max(0, Math.floor(inicioSeg))}s`;
}

module.exports = {
  TIPOS_VIDEO,
  parseFeedYoutube,
  classificarVideo,
  montarTrechos,
  urlNoInstante,
};
