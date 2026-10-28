'use strict';

// CommonJS de propósito (mesmo padrão de lib/intervalo-anos.js): testável pelo Jest da raiz.
//
// licitacoes_detalhes.valor_final vem de origens diferentes: resultado do PNCP (homologado),
// texto do contrato/ata/homologação, IA... O derivado de empenho já sai no backend
// (src/transparencia/valor-final-empenho.js). "Homologado" só para o resultado do PNCP, que tem
// escritor único e protegido; nas demais origens `origem` nem sempre descreve o valor gravado
// (os escritores de texto e IA atualizam valor e origem com condições diferentes), então o
// rótulo não afirma estágio (fiscal-valores 28/10). O ano é o do processo.

const ORIGEM_PNCP_RESULTADOS = 'pncp_orgaos';
const ROTULO_HOMOLOGADO = 'Valor homologado';
const ROTULO_INFORMADO = 'Valor final informado';
const SEM_ANO = 'sem_ano';

const NOTA_REGISTRO_PRECOS =
  'Em registro de preços, o valor homologado é o teto registrado em ata, não o valor contratado nem o gasto.';
const NOTA_VALOR_AGREGADO =
  'Valor final informado em cada processo: homologado no PNCP ou extraído do texto dos documentos (contrato, ata, homologação) e por IA. Não é o valor gasto.';

function comPeriodo(rotulo, periodo) {
  if (periodo === null || periodo === undefined || periodo === '' || periodo === SEM_ANO) {return rotulo;}
  return `${rotulo} (${periodo})`;
}

function isValorHomologado(origem) {
  return origem === ORIGEM_PNCP_RESULTADOS;
}

function rotuloValorFinal({ origem, periodo } = {}) {
  return comPeriodo(isValorHomologado(origem) ? ROTULO_HOMOLOGADO : ROTULO_INFORMADO, periodo);
}

// Soma de vários processos mistura origens: nunca se diz homologada.
function rotuloValorAgregado(periodo) {
  return comPeriodo(ROTULO_INFORMADO, periodo);
}

module.exports = {
  rotuloValorFinal,
  rotuloValorAgregado,
  isValorHomologado,
  ROTULO_INFORMADO,
  NOTA_REGISTRO_PRECOS,
  NOTA_VALOR_AGREGADO,
};
