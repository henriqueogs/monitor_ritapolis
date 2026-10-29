'use strict';

// Detalhes estruturados de uma emenda parlamentar coletada (inclui ano_referencia).
// Antes só scripts/reparsear-emendas.js gravava emendas_detalhes: emenda nova ficava sem
// esfera/valor/ano da emenda até alguém rodar o script.

const { parseEmendaParlamentar } = require('../parsers/emenda-parlamentar');
const { salvarEmendaDetalhes } = require('../db/emendas-repo');

function gravarDetalhesEmenda(documentoId, { texto, titulo = null } = {}) {
  const detalhes = parseEmendaParlamentar(texto, { titulo });
  if (!detalhes) { return false; }
  salvarEmendaDetalhes(documentoId, detalhes);
  return true;
}

module.exports = { gravarDetalhesEmenda };
