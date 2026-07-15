'use strict';

const { db } = require('./index');
const {
  CLASSIFICACAO_FINALIDADE_VERSAO,
  classificarFinalidadeDespesa,
  getFinalidadeMeta,
} = require('../transparencia/finalidade');

function parseJson(valor, fallback) {
  if (!valor) { return fallback; }
  try {
    return JSON.parse(valor);
  } catch {
    return fallback;
  }
}

function ensureClassificacaoSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS transparencia_despesas_classificacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      despesa_id INTEGER NOT NULL REFERENCES transparencia_despesas(id) ON DELETE CASCADE,
      classe_principal TEXT NOT NULL,
      subclasse TEXT,
      marcadores_json TEXT,
      confianca REAL NOT NULL DEFAULT 0,
      evidencias_json TEXT NOT NULL,
      versao TEXT NOT NULL,
      criado_em TEXT DEFAULT CURRENT_TIMESTAMP,
      atualizado_em TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (despesa_id)
    );
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_transp_classif_classe ON transparencia_despesas_classificacoes(classe_principal);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_transp_classif_versao ON transparencia_despesas_classificacoes(versao);');
}

ensureClassificacaoSchema();

const upsertStmt = db.prepare(`
  INSERT INTO transparencia_despesas_classificacoes
    (despesa_id, classe_principal, subclasse, marcadores_json, confianca, evidencias_json, versao, atualizado_em)
  VALUES
    (@despesa_id, @classe_principal, @subclasse, @marcadores_json, @confianca, @evidencias_json, @versao, CURRENT_TIMESTAMP)
  ON CONFLICT (despesa_id) DO UPDATE SET
    classe_principal = excluded.classe_principal,
    subclasse = excluded.subclasse,
    marcadores_json = excluded.marcadores_json,
    confianca = excluded.confianca,
    evidencias_json = excluded.evidencias_json,
    versao = excluded.versao,
    atualizado_em = CURRENT_TIMESTAMP
`);

function upsertClassificacaoDespesa(despesa) {
  if (!despesa?.id) { return null; }
  const classificacao = classificarFinalidadeDespesa(despesa);
  upsertStmt.run({
    despesa_id: Number(despesa.id),
    classe_principal: classificacao.classe_principal,
    subclasse: classificacao.subclasse,
    marcadores_json: JSON.stringify(classificacao.marcadores || []),
    confianca: classificacao.confianca,
    evidencias_json: JSON.stringify(classificacao.evidencias || []),
    versao: classificacao.versao,
  });
  return classificacao;
}

function classificarDespesaPorId(id) {
  const despesa = db.prepare('SELECT * FROM transparencia_despesas WHERE id = ?').get(Number(id));
  return despesa ? upsertClassificacaoDespesa(despesa) : null;
}

function reclassificarDespesasPorIds(ids = []) {
  const lista = ids.map(Number).filter(Number.isInteger);
  let atualizadas = 0;
  for (const id of lista) {
    if (classificarDespesaPorId(id)) {
      atualizadas += 1;
    }
  }
  return atualizadas;
}

function backfillClassificacoesDespesas({ limite, force = false } = {}) {
  const params = [];
  const filtros = [];
  if (!force) {
    filtros.push('(tdc.id IS NULL OR tdc.versao != ?)');
    params.push(CLASSIFICACAO_FINALIDADE_VERSAO);
  }
  const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
  const limiteSql = limite ? 'LIMIT ?' : '';
  if (limite) {
    params.push(Math.max(1, Number(limite)));
  }

  const despesas = db.prepare(`
    SELECT td.*
    FROM transparencia_despesas td
    LEFT JOIN transparencia_despesas_classificacoes tdc ON tdc.despesa_id = td.id
    ${where}
    ORDER BY td.id
    ${limiteSql}
  `).all(...params);

  const porClasse = {};
  let atualizadas = 0;
  for (const despesa of despesas) {
    const classificacao = upsertClassificacaoDespesa(despesa);
    if (!classificacao) { continue; }
    atualizadas += 1;
    porClasse[classificacao.classe_principal] = (porClasse[classificacao.classe_principal] || 0) + 1;
  }

  const pendentes = db.prepare(`
    SELECT COUNT(*) AS n
    FROM transparencia_despesas td
    LEFT JOIN transparencia_despesas_classificacoes tdc ON tdc.despesa_id = td.id
    WHERE tdc.id IS NULL OR tdc.versao != ?
  `).get(CLASSIFICACAO_FINALIDADE_VERSAO).n;

  return {
    versao: CLASSIFICACAO_FINALIDADE_VERSAO,
    selecionadas: despesas.length,
    atualizadas,
    pendentes,
    por_classe: porClasse,
  };
}

function finalidadePublica(row = {}) {
  const classe = row.finalidade_classe_principal || row.classe_principal;
  if (!classe) { return null; }
  const meta = getFinalidadeMeta(classe);
  return {
    classe,
    rotulo: meta.rotulo,
    tom: meta.tom,
    subclasse: row.finalidade_subclasse || row.subclasse || null,
    confianca: row.finalidade_confianca ?? row.confianca ?? null,
    marcadores: parseJson(row.finalidade_marcadores_json || row.marcadores_json, []),
    evidencias: parseJson(row.finalidade_evidencias_json || row.evidencias_json, []),
    versao: row.finalidade_versao || row.versao || null,
  };
}

function decorarDespesaComFinalidade(row) {
  if (!row) { return row; }
  const finalidade = finalidadePublica(row);
  const {
    finalidade_classe_principal: _classe,
    finalidade_subclasse: _subclasse,
    finalidade_marcadores_json: _marcadores,
    finalidade_confianca: _confianca,
    finalidade_evidencias_json: _evidencias,
    finalidade_versao: _versao,
    ...rest
  } = row;
  return { ...rest, finalidade };
}

const CLASSIFICACAO_SELECT = `
  tdc.classe_principal AS finalidade_classe_principal,
  tdc.subclasse AS finalidade_subclasse,
  tdc.marcadores_json AS finalidade_marcadores_json,
  tdc.confianca AS finalidade_confianca,
  tdc.evidencias_json AS finalidade_evidencias_json,
  tdc.versao AS finalidade_versao
`;

const CLASSIFICACAO_JOIN = 'LEFT JOIN transparencia_despesas_classificacoes tdc ON tdc.despesa_id = td.id';

module.exports = {
  CLASSIFICACAO_SELECT,
  CLASSIFICACAO_JOIN,
  ensureClassificacaoSchema,
  upsertClassificacaoDespesa,
  classificarDespesaPorId,
  reclassificarDespesasPorIds,
  backfillClassificacoesDespesas,
  decorarDespesaComFinalidade,
  finalidadePublica,
};
