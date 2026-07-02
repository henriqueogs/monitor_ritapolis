'use strict';

/**
 * Service do dossiê de credor: perfil do repositório + agregação por mandato
 * + deep-links do portal em cada empenho recente.
 */

const { getCredorProfile } = require('../db/credores-repo');
const { agruparPorMandato } = require('../utils/mandato');
const { comLinkPortal } = require('./portal-links');

function getCredorDossie(cnpj) {
  const perfil = getCredorProfile(cnpj);
  if (!perfil) {return null;}

  return {
    ...perfil,
    por_mandato: agruparPorMandato(perfil.por_ano, {
      camposSoma: ['n_empenhos', 'valor_total'],
    }),
    empenhos_recentes: comLinkPortal(perfil.empenhos_recentes, { exercicioKey: 'ano' }),
  };
}

module.exports = { getCredorDossie };
