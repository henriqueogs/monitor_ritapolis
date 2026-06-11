'use strict';

// Faixa de plausibilidade para valores finais homologados de uma licitação
// municipal de pequeno porte (Ritápolis). Valores fora dela quase sempre são
// artefatos de parsing — um número capturado da prosa do PDF (ex.: "60 dias",
// número de artigo) ou uma soma indevida. Nesses casos o valor é descartado e
// o campo passa a ser exibido como "não verificado" (lacuna explícita).
const PISO_VALOR_PLAUSIVEL = 100;
const TETO_VALOR_PLAUSIVEL = 100000000; // R$ 100 milhões

/**
 * Avalia se um valor final é plausível para uma licitação municipal.
 * Valores nulos/zero são tratados como "não aplicável" (já são lacuna) e
 * retornam plausível — não há o que invalidar. Valores não-numéricos idem.
 *
 * @param {number|null} valor
 * @param {{ piso?: number, teto?: number }} [opcoes]
 * @returns {{ plausivel: boolean, motivo: string|null }}
 */
function avaliarValorFinal(valor, { piso = PISO_VALOR_PLAUSIVEL, teto = TETO_VALOR_PLAUSIVEL } = {}) {
  if (valor === null || valor === undefined || valor === 0) {
    return { plausivel: true, motivo: null };
  }

  const numero = Number(valor);
  if (!Number.isFinite(numero)) {
    return { plausivel: true, motivo: null };
  }

  if (numero < piso) {
    return { plausivel: false, motivo: 'abaixo_do_piso' };
  }

  if (numero > teto) {
    return { plausivel: false, motivo: 'acima_do_teto' };
  }

  return { plausivel: true, motivo: null };
}

module.exports = {
  avaliarValorFinal,
  PISO_VALOR_PLAUSIVEL,
  TETO_VALOR_PLAUSIVEL,
};
