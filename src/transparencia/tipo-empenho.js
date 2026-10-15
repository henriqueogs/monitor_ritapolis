'use strict';

/**
 * Tipos de empenho do Portal da Transparência.
 *
 *  - EO (ordinário): valor exato, gasto efetivamente comprometido.
 *  - EE (estimativo) / EG (global): valor ESTIMADO ou total de parcelas futuras;
 *    é comprometimento, não gasto realizado. Nunca entra no destaque de "recebido".
 *  - OP (ordem de pagamento): pagamento de um empenho já existente — somá-lo
 *    ao empenho duplica o gasto.
 *
 * Os fragmentos SQL particionam qualquer valor de `tipo` (inclusive NULL ou
 * desconhecido) em exatamente um grupo: ordinário = tudo que não é EE/EG/OP.
 */

const TIPOS_EMPENHO = {
  ORDINARIO: 'EO',
  ESTIMADO: 'EE',
  GLOBAL: 'EG',
  ORDEM_PAGAMENTO: 'OP',
};

const SQL_TIPO_ORDEM_PAGAMENTO = "COALESCE(tipo, '') LIKE 'OP%'";
const SQL_TIPO_ESTIMADO_GLOBAL = "(COALESCE(tipo, '') LIKE 'EE%' OR COALESCE(tipo, '') LIKE 'EG%')";
const SQL_TIPO_ORDINARIO = `NOT ${SQL_TIPO_ORDEM_PAGAMENTO} AND NOT ${SQL_TIPO_ESTIMADO_GLOBAL}`;

function classificarTipoEmpenho(tipo) {
  const prefixo = String(tipo ?? '').trim().slice(0, 2).toUpperCase();
  if (prefixo === TIPOS_EMPENHO.ESTIMADO) {return TIPOS_EMPENHO.ESTIMADO;}
  if (prefixo === TIPOS_EMPENHO.GLOBAL) {return TIPOS_EMPENHO.GLOBAL;}
  if (prefixo === TIPOS_EMPENHO.ORDEM_PAGAMENTO) {return TIPOS_EMPENHO.ORDEM_PAGAMENTO;}
  return TIPOS_EMPENHO.ORDINARIO;
}

module.exports = {
  TIPOS_EMPENHO,
  classificarTipoEmpenho,
  SQL_TIPO_ORDEM_PAGAMENTO,
  SQL_TIPO_ESTIMADO_GLOBAL,
  SQL_TIPO_ORDINARIO,
};
