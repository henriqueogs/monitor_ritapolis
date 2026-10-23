'use strict';

/**
 * Leituras para o detector "empenhado acima do contratado": processos com o
 * texto onde o valor do contrato aparece (trecho do detalhe + anexos de
 * contrato/extrato/publicação/homologação) e empenhos que citam um processo
 * licitatório no histórico. Só queries — a regra fica em
 * src/alertas/detectores/empenhado-acima-contratado.js.
 */

const { db } = require('./connection');

const ANEXOS_COM_VALOR = ['%contrato%', '%extrato%', '%publica%', '%homolog%'];

function listarProcessosComTextoContrato() {
  const filtroAnexo = ANEXOS_COM_VALOR.map(() => 'lower(a.nome) LIKE ?').join(' OR ');
  return db
    .prepare(
      `SELECT d.id AS documento_id, d.titulo, d.url_origem, d.url_pdf, l.vencedor_cnpj,
              COALESCE(l.trecho_fonte, '') || ' ' || COALESCE((
                SELECT group_concat(a.texto_completo, ' ')
                  FROM documentos_anexos a
                 WHERE a.documento_id = d.id AND (${filtroAnexo})
              ), '') AS texto
         FROM documentos d
         LEFT JOIN licitacoes_detalhes l ON l.documento_id = d.id
        WHERE d.titulo LIKE 'Processo %'`
    )
    .all(...ANEXOS_COM_VALOR);
}

function listarEmpenhosQueCitamProcesso() {
  return db
    .prepare(
      `SELECT id, empenho, credor_nome, credor_cnpj, valor, tipo, historico,
              exercicio_orcamento, data_empenho
         FROM transparencia_despesas
        WHERE upper(historico) LIKE '%PROCESSO LICITAT%'`
    )
    .all();
}

module.exports = { listarProcessosComTextoContrato, listarEmpenhosQueCitamProcesso };
