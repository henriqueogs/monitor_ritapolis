'use strict';

// Detalhes estruturados de uma emenda parlamentar coletada (inclui ano_referencia).
// Antes só scripts/reparsear-emendas.js gravava emendas_detalhes: emenda nova ficava sem
// esfera/valor/ano da emenda até alguém rodar o script.

const { parseEmendaParlamentar } = require('../parsers/emenda-parlamentar');
const { salvarEmendaDetalhes } = require('../db/emendas-repo');
const { db } = require('../db/connection');

function gravarDetalhesEmenda(documentoId, { texto, titulo = null } = {}) {
  const detalhes = parseEmendaParlamentar(texto, { titulo });
  if (!detalhes) { return false; }
  salvarEmendaDetalhes(documentoId, detalhes);
  if (detalhes.ano_referencia || detalhes.dados_bancarios) {
    const doc = db.prepare('SELECT ano, dados_extras FROM documentos WHERE id = ?').get(documentoId);
    if (doc) {
      let extras = {};
      try {
        extras = doc.dados_extras ? JSON.parse(doc.dados_extras) : {};
      } catch {
        extras = {};
      }
      if (detalhes.dados_bancarios) {
        extras.emenda_dados_bancarios = detalhes.dados_bancarios;
      }
      db.prepare('UPDATE documentos SET ano = COALESCE(?, ano), dados_extras = ? WHERE id = ?').run(
        detalhes.ano_referencia || null,
        JSON.stringify(extras),
        documentoId
      );
    }
  }
  return true;
}

module.exports = { gravarDetalhesEmenda };
