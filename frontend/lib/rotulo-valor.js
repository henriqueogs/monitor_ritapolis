'use strict';

// CommonJS de propósito (mesmo padrão de lib/intervalo-anos.js): testável pelo Jest da raiz.
//
// licitacoes_detalhes.valor_final exibido é o homologado (o derivado de empenho já sai no
// backend, src/transparencia/valor-final-empenho.js). "Valor final" não dizia o estágio nem
// o período (fiscal-valores 28/10, achado 11; CLAUDE.md §11.1). O ano é o do processo.

const ROTULO_VALOR_HOMOLOGADO = 'Valor homologado';

// Registro de preços: o homologado é o teto registrado em ata, não o contratado nem o gasto.
const NOTA_REGISTRO_PRECOS =
  'Em registro de preços, o valor homologado é o teto registrado em ata, não o valor contratado nem o gasto.';

function rotuloValorHomologado(periodo) {
  if (periodo === null || periodo === undefined || periodo === '') {return ROTULO_VALOR_HOMOLOGADO;}
  return `${ROTULO_VALOR_HOMOLOGADO} (${periodo})`;
}

module.exports = { rotuloValorHomologado, ROTULO_VALOR_HOMOLOGADO, NOTA_REGISTRO_PRECOS };
