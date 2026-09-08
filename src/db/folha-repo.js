'use strict';

/**
 * Repositório: folha salarial (contracheque) do Portal da Transparência.
 * Entidade distinta de transparencia_despesas — chave por pessoa (vínculo +
 * matrícula) e competência (mês), não por empenho. Arquivo separado em vez
 * de crescer transparencia-repo.js (já em ~900 LOC, acima do limite do
 * CLAUDE.md).
 */

const crypto = require('crypto');
const { db } = require('./connection');
const { sanitizeFtsQuery } = require('./fts-repo');

const LIMITE_MAX = 200;

function hashFolha(vinculo, matricula, competenciaAno, competenciaMes) {
  return crypto
    .createHash('sha256')
    .update(`${vinculo}|${matricula}|${competenciaAno}|${competenciaMes}`)
    .digest('hex')
    .slice(0, 16);
}

const upsertFolhaStmt = db.prepare(`
  INSERT INTO transparencia_folha (
    vinculo, matricula, competencia_ano, competencia_mes,
    nome_servidor, cpf_mascarado, situacao, forma_admissao,
    cargo, funcao, secretaria, lotacao, sigla_cargo, data_admissao, carga_horaria,
    salario_base, remuneracao_bruta, total_liquido,
    dados_extras, hash_folha
  ) VALUES (
    @vinculo, @matricula, @competencia_ano, @competencia_mes,
    @nome_servidor, @cpf_mascarado, @situacao, @forma_admissao,
    @cargo, @funcao, @secretaria, @lotacao, @sigla_cargo, @data_admissao, @carga_horaria,
    @salario_base, @remuneracao_bruta, @total_liquido,
    @dados_extras, @hash_folha
  )
  ON CONFLICT (vinculo, matricula, competencia_ano, competencia_mes) DO UPDATE SET
    nome_servidor     = excluded.nome_servidor,
    cpf_mascarado     = excluded.cpf_mascarado,
    situacao          = excluded.situacao,
    forma_admissao    = excluded.forma_admissao,
    cargo             = excluded.cargo,
    funcao            = excluded.funcao,
    secretaria        = excluded.secretaria,
    lotacao           = excluded.lotacao,
    sigla_cargo       = excluded.sigla_cargo,
    data_admissao     = excluded.data_admissao,
    carga_horaria     = excluded.carga_horaria,
    salario_base      = excluded.salario_base,
    remuneracao_bruta = excluded.remuneracao_bruta,
    total_liquido     = excluded.total_liquido,
    dados_extras      = excluded.dados_extras,
    hash_folha        = excluded.hash_folha,
    atualizado_em     = CURRENT_TIMESTAMP
`);

/**
 * @param {object} p - saída de parseCsvFolha (folha-thread.js): vinculo,
 *   matricula, nomeServidor, cpfMascarado, situacao, formaAdmissao, cargo,
 *   funcao, secretaria, lotacao, siglaCargo, dataAdmissao, cargaHoraria,
 *   salarioBase, competenciaAno, competenciaMes, remuneracaoBruta,
 *   totalLiquido, rubricas.
 * @returns {'inserted'|'updated'|null}
 */
function upsertFolhaRegistro(p) {
  const vinculo = String(p?.vinculo || '').trim();
  const matricula = String(p?.matricula || '').trim();
  const competenciaAno = Number(p?.competenciaAno);
  const competenciaMes = Number(p?.competenciaMes);
  if (!vinculo || !matricula || !competenciaAno || !competenciaMes) {
    return null;
  }

  const existing = db.prepare(
    'SELECT id FROM transparencia_folha WHERE vinculo = ? AND matricula = ? AND competencia_ano = ? AND competencia_mes = ?'
  ).get(vinculo, matricula, competenciaAno, competenciaMes);

  upsertFolhaStmt.run({
    vinculo,
    matricula,
    competencia_ano: competenciaAno,
    competencia_mes: competenciaMes,
    nome_servidor: p.nomeServidor || null,
    cpf_mascarado: p.cpfMascarado || null,
    situacao: p.situacao || null,
    forma_admissao: p.formaAdmissao || null,
    cargo: p.cargo || null,
    funcao: p.funcao || null,
    secretaria: p.secretaria || null,
    lotacao: p.lotacao || null,
    sigla_cargo: p.siglaCargo || null,
    data_admissao: p.dataAdmissao || null,
    carga_horaria: p.cargaHoraria || null,
    salario_base: Number(p.salarioBase) || 0,
    remuneracao_bruta: Number(p.remuneracaoBruta) || 0,
    total_liquido: Number(p.totalLiquido) || 0,
    dados_extras: JSON.stringify(p),
    hash_folha: hashFolha(vinculo, matricula, competenciaAno, competenciaMes),
  });

  return existing ? 'updated' : 'inserted';
}

/**
 * @param {{q, secretaria, cargo, situacao, competenciaAno, competenciaMes, pagina, limite}} opcoes
 */
function getFolhaServidores({
  q, secretaria, cargo, situacao, competenciaAno, competenciaMes, pagina = 1, limite = 50,
} = {}) {
  const filters = [];
  const params = [];

  if (secretaria) { filters.push('tf.secretaria = ?'); params.push(secretaria); }
  if (cargo) { filters.push('tf.cargo = ?'); params.push(cargo); }
  if (situacao) { filters.push('tf.situacao = ?'); params.push(situacao); }
  if (competenciaAno) { filters.push('tf.competencia_ano = ?'); params.push(Number(competenciaAno)); }
  if (competenciaMes) { filters.push('tf.competencia_mes = ?'); params.push(Number(competenciaMes)); }

  const limiteReal = Math.min(Math.max(1, Number(limite) || 50), LIMITE_MAX);
  const offset = (Math.max(1, Number(pagina) || 1) - 1) * limiteReal;

  const executar = (filtersFinais, paramsFinais) => {
    const where = filtersFinais.length ? `WHERE ${filtersFinais.join(' AND ')}` : '';
    const total = db.prepare(`SELECT COUNT(*) AS n FROM transparencia_folha tf ${where}`).get(...paramsFinais).n;
    const dados = db.prepare(`
      SELECT tf.id, tf.vinculo, tf.matricula, tf.nome_servidor, tf.cargo, tf.funcao,
             tf.secretaria, tf.situacao, tf.competencia_ano, tf.competencia_mes,
             tf.salario_base, tf.remuneracao_bruta, tf.total_liquido
      FROM transparencia_folha tf
      ${where}
      ORDER BY tf.competencia_ano DESC, tf.competencia_mes DESC, tf.nome_servidor ASC
      LIMIT ? OFFSET ?
    `).all(...paramsFinais, limiteReal, offset);
    return { total, pagina: Number(pagina) || 1, limite: limiteReal, dados };
  };

  const ftsQuery = q ? sanitizeFtsQuery(q) : null;
  if (ftsQuery) {
    try {
      return executar(
        [...filters, 'tf.id IN (SELECT rowid FROM folha_fts WHERE folha_fts MATCH ?)'],
        [...params, ftsQuery]
      );
    } catch {
      const like = `%${String(q).slice(0, 100)}%`;
      return executar([...filters, '(tf.nome_servidor LIKE ? OR tf.cargo LIKE ?)'], [...params, like, like]);
    }
  }

  return executar(filters, params);
}

/** Histórico completo de competências de um vínculo, mais recente primeiro. */
function getFolhaServidorDossie({ vinculo, matricula }) {
  return db.prepare(`
    SELECT * FROM transparencia_folha
    WHERE vinculo = ? AND matricula = ?
    ORDER BY competencia_ano DESC, competencia_mes DESC
  `).all(vinculo, matricula);
}

/** Ranking por secretaria numa competência (default: mais recente presente). */
function getFolhaResumoSecretarias({ competenciaAno, competenciaMes } = {}) {
  const filters = [];
  const params = [];
  if (competenciaAno) { filters.push('competencia_ano = ?'); params.push(Number(competenciaAno)); }
  if (competenciaMes) { filters.push('competencia_mes = ?'); params.push(Number(competenciaMes)); }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  return db.prepare(`
    SELECT
      secretaria,
      COUNT(DISTINCT vinculo || '|' || matricula) AS total_servidores,
      ROUND(SUM(remuneracao_bruta), 2) AS total_remuneracao
    FROM transparencia_folha
    ${where}
    GROUP BY secretaria
    ORDER BY total_remuneracao DESC
  `).all(...params);
}

module.exports = {
  hashFolha,
  upsertFolhaRegistro,
  getFolhaServidores,
  getFolhaServidorDossie,
  getFolhaResumoSecretarias,
};
