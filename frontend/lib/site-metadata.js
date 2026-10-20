'use strict';

// CommonJS de propósito: testável pelo Jest da raiz. Textos do layout raiz (descrição do site,
// Open Graph e JSON-LD) a partir do ente, para o layout.js não escrever o nome da cidade à mão.

const { ente: enteConfigurado } = require('./ente');

function textosDoSite(ente = enteConfigurado) {
  return {
    descricao: `Licitações, gastos, empenhos e documentos oficiais de ${ente.nome}, ${ente.ufNome} — organizados com IA e sempre com link pra fonte oficial.`,
    descricaoOpenGraph: `Licitações, gastos, empenhos e documentos oficiais de ${ente.nome}/${ente.uf}, com fonte em cada dado.`,
    descricaoJsonLd: `A cidade de ${ente.nome}/${ente.uf} em dados abertos.`,
    nomeAlternativo: ente.nome,
  };
}

module.exports = { textosDoSite };
