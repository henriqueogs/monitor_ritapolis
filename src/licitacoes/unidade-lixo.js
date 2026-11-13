'use strict';

/**
 * Detecta valores de `unidade` que são lixo de parser (barra de tabela, traço, data, moeda,
 * percentual ou um parágrafo inteiro no lugar da unidade). Puro. Unidade legítima, mesmo
 * incomum ("Garrafa de 500 ml"), é mantida.
 */

const TAMANHO_MAXIMO_UNIDADE = 40;
const LIXO = [
  /^[\s|\-–—]*$/, // só barra/traço/espaço
  /^[|\-–—]/, // começa com barra de tabela ou traço
  /\|\s*$/, // termina com barra de tabela ("12/18/25 |")
  /^R\$\s*[\d.,]+$/, // moeda
  /^[\d.,]+\s*%$/, // percentual
];

function ehUnidadeLixo(unidade) {
  if (unidade === null || unidade === undefined) {
    return false;
  }
  const texto = String(unidade).trim();
  return texto.length > TAMANHO_MAXIMO_UNIDADE || LIXO.some(regex => regex.test(texto));
}

module.exports = { ehUnidadeLixo };
