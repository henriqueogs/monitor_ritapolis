'use strict';

// Cache TTL pros agregados pesados que ainda vivem no monolito
// (src/db/index.js): sem params, recalculam GROUP BY sobre todo o acervo a
// cada chamada. Fase 2 do plano de performance (docs/PLANO_PERFORMANCE_CARREGAMENTO.md).
const {
  getPainelCidadao: getPainelCidadaoRepo,
  getEstatisticas: getEstatisticasRepo,
  getInteligenciaPanorama: getInteligenciaPanoramaRepo,
  getCoberturaPorAno: getCoberturaPorAnoRepo
} = require('../db');
const { memoTtl } = require('../utils/memo-ttl');
const { registrar } = require('./cache-registry');
const { getPainelTransparencia } = require('../transparencia/painel-service');
const { getGastosPanorama } = require('../transparencia/gastos-service');

const TTL_MS = 10 * 60 * 1000;

const getPainelCidadao = registrar(memoTtl(getPainelCidadaoRepo, { ttlMs: TTL_MS }));
const getEstatisticas = registrar(memoTtl(getEstatisticasRepo, { ttlMs: TTL_MS }));
const getInteligenciaPanorama = registrar(memoTtl(getInteligenciaPanoramaRepo, { ttlMs: TTL_MS }));
const getCoberturaPorAno = registrar(memoTtl(getCoberturaPorAnoRepo, { ttlMs: TTL_MS }));

// Popula o cache de todos os agregados pesados de uma vez -- chamado no boot
// (scripts/api.js) pra deploy/restart nao pagar o primeiro acesso lento.
function warmUpAgregados() {
  getPainelCidadao();
  getEstatisticas();
  getInteligenciaPanorama();
  getCoberturaPorAno();
  getPainelTransparencia();
  getGastosPanorama();
}

module.exports = {
  getPainelCidadao,
  getEstatisticas,
  getInteligenciaPanorama,
  getCoberturaPorAno,
  warmUpAgregados
};
