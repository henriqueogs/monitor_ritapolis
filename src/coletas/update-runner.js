const logger = require('../logger');
const ColetorCamara = require('../coletores/camara');
const ColetorSitePrefeitura = require('../coletores/site-prefeitura');

const state = {
  running: false,
  startedAt: null,
  finishedAt: null,
  fonte: null,
  status: 'idle',
  resultados: [],
  erro: null
};

function snapshot() {
  return {
    running: state.running,
    started_at: state.startedAt,
    finished_at: state.finishedAt,
    fonte: state.fonte,
    status: state.status,
    resultados: state.resultados,
    erro: state.erro
  };
}

function buildCollectors(fonte) {
  if (fonte === 'site_prefeitura') return [new ColetorSitePrefeitura()];
  if (fonte === 'camara') return [new ColetorCamara()];
  if (!fonte || fonte === 'todas') return [new ColetorSitePrefeitura(), new ColetorCamara()];

  throw new Error(`Fonte de coleta nao suportada: ${fonte}`);
}

async function runCollection(fonte) {
  const coletores = buildCollectors(fonte);
  const resultados = [];

  for (const coletor of coletores) {
    resultados.push(await coletor.run());
  }

  return resultados;
}

function startCollectionUpdate({ fonte = 'todas' } = {}) {
  if (state.running) {
    return {
      started: false,
      status: snapshot()
    };
  }

  state.running = true;
  state.startedAt = new Date().toISOString();
  state.finishedAt = null;
  state.fonte = fonte || 'todas';
  state.status = 'processando';
  state.resultados = [];
  state.erro = null;

  runCollection(state.fonte)
    .then((resultados) => {
      state.resultados = resultados;
      state.status = resultados.some((item) => item.status === 'erro_total') ? 'erro_parcial' : 'ok';
    })
    .catch((error) => {
      state.status = 'erro_total';
      state.erro = error.message;
      logger.error('Atualizacao manual de coleta falhou', {
        fonte: state.fonte,
        erro: error.message,
        stack: error.stack
      });
    })
    .finally(() => {
      state.running = false;
      state.finishedAt = new Date().toISOString();
    });

  return {
    started: true,
    status: snapshot()
  };
}

module.exports = {
  getCollectionUpdateStatus: snapshot,
  startCollectionUpdate
};
