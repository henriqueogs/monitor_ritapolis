'use strict';

/**
 * Service do dossiê de empenho — compõe a despesa com classificação cidadã,
 * deep-link do portal, status de pagamento e empenhos relacionados.
 */

const {
  getDespesaById,
  getResumoRelacionados,
  getResumoCategoriaAno,
} = require('../db/transparencia-agregados-repo');
const { classificarCategoria, slugParaPrefixos } = require('./categorias');
const { buildPortalDespesaLink } = require('./portal-links');

const STATUS_PAGAMENTO = {
  PAGO: 'pago',
  LIQUIDADO_NAO_PAGO: 'liquidado_nao_pago',
  EMPENHADO: 'empenhado',
};

function statusPagamento(despesa) {
  if (despesa.data_pagamento) {return STATUS_PAGAMENTO.PAGO;}
  if (despesa.data_liquidacao) {return STATUS_PAGAMENTO.LIQUIDADO_NAO_PAGO;}
  return STATUS_PAGAMENTO.EMPENHADO;
}

function getEmpenhoDossie(id) {
  const despesa = getDespesaById(id);
  if (!despesa) {return null;}

  const categoria = classificarCategoria(despesa.categoria_economica);
  const exercicio = despesa.exercicio_orcamento;
  const { documento_titulo, documento_numero, ...colunas } = despesa;

  const mesmoCredor = despesa.credor_cnpj
    ? {
        exercicio,
        ...getResumoRelacionados({
          credorCnpj: despesa.credor_cnpj,
          exercicio,
          exceptId: despesa.id,
        }),
      }
    : null;

  const prefixos = slugParaPrefixos(categoria.slug);
  const mesmaCategoria = prefixos
    ? {
        exercicio,
        slug: categoria.slug,
        ...getResumoCategoriaAno({ prefixos, exercicio, exceptId: despesa.id }),
      }
    : null;

  return {
    empenho: {
      ...colunas,
      categoria_cidada: categoria,
      status_pagamento: statusPagamento(despesa),
      portal: buildPortalDespesaLink({
        empenho: despesa.empenho,
        exercicio,
        tipo: despesa.tipo,
      }),
    },
    documento: despesa.documento_id
      ? { id: despesa.documento_id, titulo: documento_titulo, numero: documento_numero }
      : null,
    relacionados: {
      mesmo_credor_ano: mesmoCredor,
      mesma_categoria_ano: mesmaCategoria,
    },
  };
}

module.exports = { getEmpenhoDossie, STATUS_PAGAMENTO };
