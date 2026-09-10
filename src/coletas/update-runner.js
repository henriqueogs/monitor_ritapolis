const logger = require('../logger');
const ColetorSitePrefeitura = require('../coletores/site-prefeitura');
const ColetorLegislacaoPrefeitura = require('../coletores/site-prefeitura-legislacao');
const ColetorPncp = require('../coletores/pncp');
const ColetorPortalTransparencia = require('../coletores/portal-transparencia');
const ColetorFolha = require('../coletores/folha');
const ColetorCamaraLegislacao = require('../coletores/camara-legislacao');
const ColetorCamaraProjetos = require('../coletores/camara-projetos');

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
  if (fonte === 'site_prefeitura') {return [new ColetorSitePrefeitura()];}
  if (fonte === 'legislacao_prefeitura') {return [new ColetorLegislacaoPrefeitura()];}
  if (fonte === 'camara_legislacao') {return [new ColetorCamaraLegislacao()];}
  if (fonte === 'camara_projetos') {return [new ColetorCamaraProjetos()];}
  if (fonte === 'pncp') {return [new ColetorPncp()];}
  if (fonte === 'portal_transparencia') {return [new ColetorPortalTransparencia()];}
  if (fonte === 'portal_transparencia_folha') {return [new ColetorFolha()];}
  if (!fonte || fonte === 'todas') {return [
    new ColetorSitePrefeitura(),
    new ColetorLegislacaoPrefeitura(),
    // ColetorCamaraLegislacao/ColetorCamaraProjetos: validados em producao
    // em 09/09/2026 (1019 + 107/5 registros, 0 erros) -- entram no ciclo
    // automatico agora.
    new ColetorCamaraLegislacao(),
    new ColetorCamaraProjetos(),
    new ColetorPncp(),
    new ColetorPortalTransparencia(),
    new ColetorFolha(),
  ];}

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
