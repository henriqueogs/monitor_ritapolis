'use strict';

/**
 * Repositório de credores — Monitor Ritápolis.
 * Agrega dados de transparencia_despesas + licitacoes_detalhes
 * para construir perfis ricos de fornecedores por CNPJ.
 */

const { db } = require('./index');

// ── Listagem ──────────────────────────────────────────────────────────────────

/**
 * Lista credores com mais presença no sistema (empenhos reais).
 * Exclui folha de pagamento e entidades sem CNPJ.
 * @param {{ limite, pagina, busca, exercicio }} opcoes
 */
function listCredores({ limite = 50, pagina = 1, busca, exercicio } = {}) {
  const offset = (pagina - 1) * limite;
  const filters = [
    "credor_cnpj IS NOT NULL AND credor_cnpj != ''",
    "UPPER(credor_nome) NOT LIKE '%FOLHA%PAGAMENTO%'",
    "UPPER(credor_nome) NOT LIKE '%PAGAMENTO%FOLHA%'",
    "UPPER(credor_nome) NOT LIKE '%13%SALARIO%'",
  ];
  const params = [];

  if (busca) {
    filters.push("UPPER(credor_nome) LIKE UPPER(?)");
    params.push(`%${busca}%`);
  }
  if (exercicio) {
    filters.push('exercicio_orcamento = ?');
    params.push(exercicio);
  }

  const where = `WHERE ${filters.join(' AND ')}`;

  const total = db.prepare(`SELECT COUNT(DISTINCT credor_cnpj) n FROM transparencia_despesas ${where}`).get(...params).n;

  const dados = db.prepare(`
    SELECT
      credor_cnpj,
      credor_nome,
      COUNT(*)                            AS n_empenhos,
      ROUND(SUM(valor), 2)                AS valor_total,
      COUNT(DISTINCT exercicio_orcamento) AS n_anos,
      MIN(exercicio_orcamento)            AS primeiro_ano,
      MAX(exercicio_orcamento)            AS ultimo_ano,
      COUNT(DISTINCT funcao)              AS n_funcoes
    FROM transparencia_despesas
    ${where}
    GROUP BY credor_cnpj
    ORDER BY valor_total DESC
    LIMIT ? OFFSET ?
  `).all(...params, limite, offset);

  return { total, pagina, limite, dados };
}

// ── Perfil completo ───────────────────────────────────────────────────────────

/**
 * Retorna perfil detalhado de um credor por CNPJ.
 * Combina: empenhos reais + licitações ganhas (documentos) + tendência histórica.
 */
function getCredorProfile(cnpj) {
  if (!cnpj) {return null;}
  const cnpjClean = String(cnpj).replace(/\D/g, '');

  // ── Identidade ──
  const identidade = db.prepare(`
    SELECT credor_cnpj, credor_nome,
      COUNT(*)                            AS n_empenhos,
      ROUND(SUM(valor), 2)                AS valor_total,
      MIN(data_empenho)                   AS primeiro_empenho,
      MAX(data_empenho)                   AS ultimo_empenho,
      MIN(exercicio_orcamento)            AS primeiro_ano,
      MAX(exercicio_orcamento)            AS ultimo_ano,
      COUNT(DISTINCT exercicio_orcamento) AS n_anos,
      COUNT(DISTINCT funcao)              AS n_funcoes
    FROM transparencia_despesas
    WHERE credor_cnpj = ?
  `).get(cnpjClean);

  if (!identidade || !identidade.n_empenhos) {return null;}

  // ── Histórico por ano ──
  const porAno = db.prepare(`
    SELECT
      exercicio_orcamento  AS ano,
      COUNT(*)             AS n_empenhos,
      ROUND(SUM(valor), 2) AS valor_total
    FROM transparencia_despesas
    WHERE credor_cnpj = ?
    GROUP BY ano ORDER BY ano
  `).all(cnpjClean);

  // ── Por área funcional ──
  const porFuncao = db.prepare(`
    SELECT
      funcao,
      COUNT(*)             AS n_empenhos,
      ROUND(SUM(valor), 2) AS valor_total
    FROM transparencia_despesas
    WHERE credor_cnpj = ? AND funcao IS NOT NULL
    GROUP BY funcao ORDER BY valor_total DESC
  `).all(cnpjClean);

  // ── Empenhos recentes ──
  const empenhosRecentes = db.prepare(`
    SELECT
      td.empenho, td.data_empenho, td.valor, td.funcao, td.historico, td.tipo,
      td.exercicio_orcamento AS ano,
      d.titulo               AS documento_titulo,
      d.id                   AS documento_id
    FROM transparencia_despesas td
    LEFT JOIN documentos d ON d.id = td.documento_id
    WHERE td.credor_cnpj = ?
    ORDER BY td.data_empenho DESC, td.valor DESC
    LIMIT 20
  `).all(cnpjClean);

  // Normalização de CNPJ em SQL — as colunas guardam formatos mistos
  const cnpjNorm = (col) => `REPLACE(REPLACE(REPLACE(REPLACE(${col}, '.', ''), '/', ''), '-', ''), ' ', '')`;

  // ── Licitações ganhas (documentos) ──
  const licitacoesGanhas = db.prepare(`
    SELECT
      ld.documento_id, ld.vencedor_nome, ld.vencedor_cnpj,
      d.valor_estimado, ld.valor_final, ld.data_homologacao, ld.modalidade,
      d.titulo, d.ano, d.numero
    FROM licitacoes_detalhes ld
    JOIN documentos d ON d.id = ld.documento_id
    WHERE ${cnpjNorm('ld.vencedor_cnpj')} = ?
    ORDER BY d.ano DESC, ld.data_homologacao DESC
    LIMIT 20
  `).all(cnpjClean);

  // ── Fornecedor perfil consolidado (licitado + pago, ver 3.2) ──
  const perfil = db.prepare(`
    SELECT nome_canonico, total_valor_vencedor, total_valor_produtos, total_valor_pago,
           n_vitorias, n_itens_produtos, n_licitacoes_vencedor, anos_ativos
    FROM fornecedores_perfil WHERE ${cnpjNorm('cnpj')} = ?
  `).get(cnpjClean);

  // ── Tendência (crescimento último ano vs penúltimo) ──
  const ultimoAno = porAno[porAno.length - 1];
  const penultimoAno = porAno[porAno.length - 2];
  const crescimento_yoy = penultimoAno?.valor_total > 0
    ? Math.round(((ultimoAno?.valor_total - penultimoAno.valor_total) / penultimoAno.valor_total) * 100)
    : null;

  return {
    cnpj: cnpjClean,
    nome: identidade.credor_nome,
    nome_canonico: perfil?.nome_canonico || identidade.credor_nome,
    resumo: {
      n_empenhos: identidade.n_empenhos,
      valor_total: identidade.valor_total,
      n_anos: identidade.n_anos,
      primeiro_ano: identidade.primeiro_ano,
      ultimo_ano: identidade.ultimo_ano,
      n_funcoes: identidade.n_funcoes,
      primeiro_empenho: identidade.primeiro_empenho,
      ultimo_empenho: identidade.ultimo_empenho,
      crescimento_yoy,
      // Licitado vs pago: valor homologado em licitações vencidas (quando há perfil)
      total_licitado: perfil?.total_valor_vencedor || 0,
      total_pago: identidade.valor_total,
      n_licitacoes_vencidas: perfil?.n_licitacoes_vencedor || licitacoesGanhas.length,
    },
    por_ano: porAno,
    por_funcao: porFuncao,
    empenhos_recentes: empenhosRecentes,
    licitacoes_ganhas: licitacoesGanhas,
    perfil_consolidado: perfil || null,
  };
}

module.exports = { listCredores, getCredorProfile };
