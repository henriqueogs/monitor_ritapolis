'use strict';

/**
 * Legenda de um vídeo do YouTube, sem chave de API.
 *
 * Conferido em 13/11/2026: a página web devolve URL de legenda que responde vazio; o player
 * no perfil do aplicativo iOS devolve URL que funciona. De IP de datacenter (a VM de produção)
 * o YouTube responde LOGIN_REQUIRED — por isso a transcrição roda fora da VM e é importada.
 */

const config = require('../config');

const IDIOMA = 'pt';
const CLIENTE_IOS = {
  clientName: 'IOS',
  clientVersion: '20.10.4',
  deviceModel: 'iPhone16,2',
  hl: 'pt',
  gl: 'BR',
};
const USER_AGENT_IOS = 'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3 like Mac OS X)';
const STATUS_OK = 'OK';

async function lerJson(resposta, videoId, etapa) {
  if (!resposta.ok) {
    throw new Error(`YouTube falhou em ${etapa} do vídeo ${videoId}: HTTP ${resposta.status}`);
  }
  return resposta.json();
}

/**
 * @returns {Promise<{eventos: object[], idioma: string, automatica: boolean}|null>}
 *   null quando o vídeo não tem legenda em português
 */
async function buscarLegenda(videoId, { fetchFn = fetch } = {}) {
  const player = await lerJson(
    await fetchFn(config.youtubePlayerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT_IOS },
      body: JSON.stringify({ videoId, context: { client: CLIENTE_IOS } }),
    }),
    videoId,
    'player'
  );

  const status = player.playabilityStatus?.status;
  if (status !== STATUS_OK) {
    throw new Error(
      `YouTube recusou o vídeo ${videoId}: ${status} (LOGIN_REQUIRED costuma ser IP de datacenter)`
    );
  }

  const faixas = player.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
  const faixa = faixas.find((f) => String(f.languageCode || '').startsWith(IDIOMA));
  if (!faixa) {
    return null;
  }

  const legenda = await lerJson(
    await fetchFn(`${faixa.baseUrl}&fmt=json3`, { headers: { 'User-Agent': USER_AGENT_IOS } }),
    videoId,
    'legenda'
  );
  return { eventos: legenda.events || [], idioma: faixa.languageCode, automatica: faixa.kind === 'asr' };
}

module.exports = { buscarLegenda };
