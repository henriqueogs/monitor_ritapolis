const ColetorSitePrefeitura = require('../coletores/site-prefeitura');
const config = require('../config');
const logger = require('../logger');
const { db } = require('../db');
const { startCollectionUpdate, getCollectionUpdateStatus } = require('./update-runner');

const state = {
  lastCheckedAt: null,
  lastResult: null
};

function parsePrefeituraUpdatedAt(text) {
  const source = String(text || '').replace(/\s+/g, ' ');
  const match = source.match(
    /(?:[\u00daU\u00c3\u0161]ltima atualiza[c\u00e7\u00c3\u00a7][a\u00e3\u00c3\u00a3]o em:\s*)?(\d{2})\/(\d{2})\/(\d{4})\s*(?:\u00e0s|as|\u00c3\u00a0s)\s*(\d{2}):(\d{2})/i
  );

  if (!match) return null;

  const [, day, month, year, hour, minute] = match;
  return `${year}-${month}-${day}T${hour}:${minute}:00-03:00`;
}

function getLatestLocalPrefeituraCollection() {
  return db
    .prepare(
      `SELECT fonte, fim, status, itens_novos, itens_atualizados, itens_com_erro
       FROM coletas_log
       WHERE fonte = 'site_prefeitura'
         AND fim IS NOT NULL
         AND status IN ('ok', 'erro_parcial')
       ORDER BY fim DESC
       LIMIT 1`
    )
    .get() || null;
}

async function fetchAreaUpdatedAt(coletor, area) {
  const shell = await coletor.fetchPageShell(area);
  const cadastroIds = coletor.extractCadastroGenericoIds(shell.html);
  const referencias = [];

  for (const cadastroId of cadastroIds) {
    const meta = await coletor.fetchCadastroMeta(cadastroId);
    referencias.push({
      cadastro_id: cadastroId,
      titulo: meta.title || area.titulo,
      atualizado_em: parsePrefeituraUpdatedAt(meta.updatedAt)
    });
  }

  const atualizadoEm = referencias
    .map((referencia) => referencia.atualizado_em)
    .filter(Boolean)
    .sort()
    .at(-1) || null;

  return {
    area_id: area.id,
    titulo: area.titulo,
    public_url: area.publicUrl,
    cadastro_generico_ids: cadastroIds,
    referencias,
    atualizado_em: atualizadoEm,
    status: cadastroIds.length === 0
      ? 'sem_cadastro_generico'
      : atualizadoEm
        ? 'ok'
        : 'sem_data_publicada'
  };
}

function compareDates(remoteIso, localIso) {
  if (!remoteIso) return 'sem_referencia';
  if (!localIso) return 'desatualizado';

  const remoteTime = new Date(remoteIso).getTime();
  const localTime = new Date(localIso).getTime();
  if (!Number.isFinite(remoteTime) || !Number.isFinite(localTime)) return 'sem_referencia';

  return remoteTime > localTime ? 'desatualizado' : 'atualizado';
}

function shouldUseCachedResult(now) {
  const intervalMs = config.prefeituraSyncCheckIntervalMs;
  if (!state.lastCheckedAt || !state.lastResult) return false;
  if (state.lastResult.coleta?.started && !getCollectionUpdateStatus().running) return false;
  if (state.lastResult.status === 'desatualizado' && !getCollectionUpdateStatus().running) return false;
  return now - new Date(state.lastCheckedAt).getTime() < intervalMs;
}

async function checkPrefeituraSyncOnPortalOpen() {
  const now = Date.now();

  if (shouldUseCachedResult(now)) {
    return {
      ...state.lastResult,
      cache: 'hit'
    };
  }

  const checkedAt = new Date().toISOString();
  const local = getLatestLocalPrefeituraCollection();
  const coletor = new ColetorSitePrefeitura();
  const areas = [];
  const erros = [];

  for (const area of ColetorSitePrefeitura.AREAS) {
    try {
      areas.push(await fetchAreaUpdatedAt(coletor, area));
    } catch (error) {
      erros.push({
        area_id: area.id,
        titulo: area.titulo,
        public_url: area.publicUrl,
        erro: error.message || 'Falha ao consultar area'
      });
      areas.push({
        area_id: area.id,
        titulo: area.titulo,
        public_url: area.publicUrl,
        atualizado_em: null,
        status: 'indisponivel'
      });
    }
  }

  const referencias = areas
    .map((area) => area.atualizado_em)
    .filter(Boolean)
    .sort();
  const siteUpdatedAt = referencias[referencias.length - 1] || null;
  const status = compareDates(siteUpdatedAt, local?.fim);
  let coleta = {
    started: false,
    motivo: status
  };

  if (status === 'desatualizado') {
    coleta = {
      ...startCollectionUpdate({ fonte: 'site_prefeitura' }),
      motivo: status
    };
  } else if (getCollectionUpdateStatus().running) {
    coleta = {
      started: false,
      motivo: 'coleta_em_andamento',
      status: getCollectionUpdateStatus()
    };
  }

  const result = {
    status: erros.length === areas.length ? 'indisponivel' : status,
    checked_at: checkedAt,
    site_atualizado_em: siteUpdatedAt,
    ultima_coleta_local: local,
    areas,
    erros,
    coleta,
    cache: 'miss'
  };

  state.lastCheckedAt = checkedAt;
  state.lastResult = result;

  logger.info('Sincronizacao da Prefeitura verificada ao abrir portal', {
    status: result.status,
    site_atualizado_em: siteUpdatedAt,
    ultima_coleta_local: local?.fim || null,
    coleta_iniciada: Boolean(coleta.started)
  });

  return result;
}

module.exports = {
  checkPrefeituraSyncOnPortalOpen,
  parsePrefeituraUpdatedAt
};
