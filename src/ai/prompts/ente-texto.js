'use strict';

/**
 * Texto do ente (município) para os prompts de IA. O nome vem da configuração (src/ente.js), não
 * de literal: outro município = outras variáveis de ambiente, sem tocar nos prompts. Mesmo sendo
 * configuração confiável, o nome é higienizado (sem < >, sem quebra de linha, tamanho limitado)
 * porque entra em prompt que também carrega conteúdo não confiável.
 */

const { ente: enteConfigurado } = require('../../ente');

const NOME_MAXIMO = 80;
const UF_TAMANHO = 2;

const limpar = texto =>
  String(texto ?? '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** "Prefeitura de <nome>" */
function nomePrefeitura(ente = enteConfigurado) {
  return `Prefeitura de ${limpar(ente.nome).slice(0, NOME_MAXIMO).trim()}`;
}

/** "Prefeitura de <nome> (<UF>)" */
function descreverPrefeitura(ente = enteConfigurado) {
  const uf = limpar(ente.uf).slice(0, UF_TAMANHO).toUpperCase();
  return `${nomePrefeitura(ente)} (${uf})`;
}

module.exports = { descreverPrefeitura, nomePrefeitura };
