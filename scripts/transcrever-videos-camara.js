'use strict';

// Transcrição dos vídeos das sessões da Câmara (legenda do YouTube).
//
// O YouTube nega legenda a IP de datacenter, então a VM não transcreve. Fluxo de produção:
//   1. Na VM:      node scripts/transcrever-videos-camara.js --pendentes pendentes.json
//   2. Fora dela:  node scripts/transcrever-videos-camara.js --exportar transcricoes.json --de pendentes.json
//   3. Na VM:      node scripts/transcrever-videos-camara.js --importar transcricoes.json
// Sem argumentos (desenvolvimento): coleta o feed e transcreve os pendentes no banco local.
// Os passos 1 e 3 e o modo sem argumentos usam o banco; o passo 2 não usa.

const fs = require('fs');
const logger = require('../src/logger');

const PAUSA_ENTRE_VIDEOS_MS = 2000;

function argumento(nome) {
  const i = process.argv.indexOf(nome);
  return i === -1 ? null : process.argv[i + 1];
}

function lerJson(caminho) {
  return JSON.parse(fs.readFileSync(caminho, 'utf8'));
}

async function transcreverTodos(videoIds) {
  const { transcreverVideo } = require('../src/services/videos-camara-service');
  const itens = [];
  for (const videoId of videoIds) {
    try {
      const item = await transcreverVideo(videoId);
      itens.push(item);
      logger.info('video transcrito', { videoId, trechos: item.trechos.length });
    } catch (err) {
      logger.error('falha ao transcrever video', { videoId, erro: err.message });
    }
    await new Promise((resolve) => setTimeout(resolve, PAUSA_ENTRE_VIDEOS_MS));
  }
  return itens;
}

function abrirBanco() {
  require('../src/db/setup').setupDatabase();
  return {
    ...require('../src/db/camara-videos-repo'),
    ...require('../src/services/videos-camara-service'),
  };
}

async function main() {
  const pendentes = argumento('--pendentes');
  const exportar = argumento('--exportar');
  const importar = argumento('--importar');

  if (exportar) {
    const ids = lerJson(argumento('--de'));
    fs.writeFileSync(exportar, JSON.stringify(await transcreverTodos(ids)));
    logger.info('transcricoes exportadas', { arquivo: exportar, videos: ids.length });
    return;
  }

  const banco = abrirBanco();
  if (pendentes) {
    const ids = banco.listarVideosPendentes().map((v) => v.video_id);
    fs.writeFileSync(pendentes, JSON.stringify(ids));
    logger.info('pendentes listados', { arquivo: pendentes, videos: ids.length });
    return;
  }
  if (importar) {
    logger.info('transcricoes importadas', banco.importarTranscricoes(lerJson(importar)));
    return;
  }

  const ColetorCamaraVideos = require('../src/coletores/camara-videos');
  await new ColetorCamaraVideos().run();
  const ids = banco.listarVideosPendentes().map((v) => v.video_id);
  logger.info('transcricoes gravadas', banco.importarTranscricoes(await transcreverTodos(ids)));
}

main().catch((error) => {
  logger.error('transcrever-videos-camara falhou', { erro: error.message });
  process.exit(1);
});
