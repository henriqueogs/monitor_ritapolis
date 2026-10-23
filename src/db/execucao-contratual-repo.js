'use strict';

/**
 * Leituras para o detector "empenhado acima do contratado": processos (com o
 * trecho do detalhe), anexos de contrato/extrato/publicação/homologação onde o
 * valor do contrato aparece, e empenhos que citam um processo
 * licitatório no histórico. Só queries — a regra fica em
 * src/alertas/detectores/empenhado-acima-contratado.js.
 */

const { db } = require('./connection');

const ANEXOS_COM_VALOR = ['%contrato%', '%extrato%', '%publica%', '%homolog%'];

function listarProcessosComTextoContrato() {
  return db
    .prepare(
      `SELECT d.id AS documento_id, d.titulo, d.url_origem, d.url_pdf, l.vencedor_cnpj,
              COALESCE(l.trecho_fonte, '') AS texto
         FROM documentos d
         LEFT JOIN licitacoes_detalhes l ON l.documento_id = d.id
        WHERE d.titulo LIKE 'Processo %'`
    )
    .all();
}

// Anexos de processos cujo nome indica contrato/extrato/publicação/homologação
// (edital fica de fora: o valor dele é estimado, não contratado).
function listarAnexosDeContrato() {
  const filtroAnexo = ANEXOS_COM_VALOR.map(() => 'lower(a.nome) LIKE ?').join(' OR ');
  return db
    .prepare(
      `SELECT a.documento_id, a.id AS anexo_id, a.nome, a.texto_completo AS texto
         FROM documentos_anexos a
         JOIN documentos d ON d.id = a.documento_id
        WHERE d.titulo LIKE 'Processo %' AND a.texto_completo IS NOT NULL AND (${filtroAnexo})
        ORDER BY a.documento_id, a.id`
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

module.exports = { listarProcessosComTextoContrato, listarAnexosDeContrato, listarEmpenhosQueCitamProcesso };
