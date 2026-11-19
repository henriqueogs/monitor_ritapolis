'use strict';

// Coletor: vídeos novos no canal da Câmara no YouTube, pelo feed público do canal (os 15 mais
// recentes, sem chave de API). Só registra o vídeo; a transcrição entra depois, por
// scripts/transcrever-videos-camara.js, porque o YouTube nega legenda a IP de datacenter.

const ColetorBase = require('./base');
const logger = require('../logger');
const { fontes } = require('../fontes');
const { upsertCamaraColetaLog } = require('../db/camara-repo');
const { registrarVideosDoFeed } = require('../services/videos-camara-service');

class ColetorCamaraVideos extends ColetorBase {
  constructor() {
    super({ fonte: 'camara_videos' });
  }

  async executar(resultado) {
    if (!fontes.feedVideosCamara) {
      logger.info('camara-videos: município sem canal configurado, nada a coletar');
      return;
    }
    const response = await this.buscarComRetry(fontes.feedVideosCamara, { responseType: 'text' });
    const stats = registrarVideosDoFeed(response.data);
    resultado.itens_novos += stats.novos;
    resultado.itens_atualizados += stats.atualizados;
    upsertCamaraColetaLog({ tipo: 'videos', ...stats, status: 'ok' });
    logger.info('camara-videos: feed coletado', stats);
  }
}

module.exports = ColetorCamaraVideos;
