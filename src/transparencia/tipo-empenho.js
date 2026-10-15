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

// Colunas de agregação padrão (qualquer tabela com `tipo` e `valor`):
//  n/valor_total = ordinário; *_estimado_global = EE + EG; OP nunca entra.
const SQL_SUM_ORDINARIO = `ROUND(SUM(CASE WHEN ${SQL_TIPO_ORDINARIO} THEN valor ELSE 0 END), 2)`;
const SQL_SUM_ESTIMADO_GLOBAL = `ROUND(SUM(CASE WHEN ${SQL_TIPO_ESTIMADO_GLOBAL} THEN valor ELSE 0 END), 2)`;
const SQL_COUNT_ORDINARIO = `SUM(CASE WHEN ${SQL_TIPO_ORDINARIO} THEN 1 ELSE 0 END)`;
const SQL_COUNT_ESTIMADO_GLOBAL = `SUM(CASE WHEN ${SQL_TIPO_ESTIMADO_GLOBAL} THEN 1 ELSE 0 END)`;
const SQL_SEM_ORDEM_PAGAMENTO = `NOT ${SQL_TIPO_ORDEM_PAGAMENTO}`;

/**
 * Fragmento "ordinário" para uma coluna qualificada (ex.: 'td' → td.tipo), útil
 * quando o JOIN traz outra tabela com coluna `tipo` (documentos).
 */
function sqlTipoOrdinario(alias = '') {
  if (!alias) {return SQL_TIPO_ORDINARIO;}
  const col = `${alias}.tipo`;
  return `NOT COALESCE(${col}, '') LIKE 'OP%' AND NOT (COALESCE(${col}, '') LIKE 'EE%' OR COALESCE(${col}, '') LIKE 'EG%')`;
}

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
  SQL_SUM_ORDINARIO,
  SQL_SUM_ESTIMADO_GLOBAL,
  SQL_COUNT_ORDINARIO,
  SQL_COUNT_ESTIMADO_GLOBAL,
  SQL_SEM_ORDEM_PAGAMENTO,
  sqlTipoOrdinario,
};
