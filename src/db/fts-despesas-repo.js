'use strict';

/**
 * Índice FTS5 dos empenhos (despesas_fts: historico + credor_nome + empenho).
 * Tabela e triggers vivem no schema.sql; aqui ficam a garantia de schema em
 * bancos antigos e o rebuild de inicialização — mesmo padrão de fts-repo.js.
 */

const { db } = require('./index');

const DDL = `
CREATE VIRTUAL TABLE IF NOT EXISTS despesas_fts USING fts5(
  historico, credor_nome, empenho,
  content='transparencia_despesas', content_rowid='id',
  tokenize='unicode61 remove_diacritics 2'
);
CREATE TRIGGER IF NOT EXISTS despesas_fts_ai AFTER INSERT ON transparencia_despesas BEGIN
  INSERT INTO despesas_fts(rowid, historico, credor_nome, empenho)
  VALUES (new.id, new.historico, new.credor_nome, new.empenho);
END;
CREATE TRIGGER IF NOT EXISTS despesas_fts_ad AFTER DELETE ON transparencia_despesas BEGIN
  INSERT INTO despesas_fts(despesas_fts, rowid, historico, credor_nome, empenho)
  VALUES ('delete', old.id, old.historico, old.credor_nome, old.empenho);
END;
CREATE TRIGGER IF NOT EXISTS despesas_fts_au AFTER UPDATE OF historico, credor_nome, empenho ON transparencia_despesas
WHEN old.historico IS NOT new.historico OR old.credor_nome IS NOT new.credor_nome OR old.empenho IS NOT new.empenho BEGIN
  INSERT INTO despesas_fts(despesas_fts, rowid, historico, credor_nome, empenho)
  VALUES ('delete', old.id, old.historico, old.credor_nome, old.empenho);
  INSERT INTO despesas_fts(rowid, historico, credor_nome, empenho)
  VALUES (new.id, new.historico, new.credor_nome, new.empenho);
END;
`;

function ensureDespesasFtsSchema() {
  const oldTrigger = db.prepare("SELECT sql FROM sqlite_master WHERE type='trigger' AND name='despesas_fts_au'").get();
  // One-time migration of the trigger only: no data deletion or index rebuild.
  if (oldTrigger && !oldTrigger.sql.includes('WHEN old.historico IS NOT new.historico')) {
    db.exec('DROP TRIGGER despesas_fts_au;');
  }
  db.exec(DDL);
}

function rebuildDespesasFtsIndex() {
  ensureDespesasFtsSchema();
  db.exec("INSERT INTO despesas_fts(despesas_fts) VALUES('rebuild')");
  return db.prepare('SELECT COUNT(*) n FROM despesas_fts').get().n;
}

function isDespesasFtsReady() {
  try {
    const temDespesas = db.prepare('SELECT COUNT(*) n FROM transparencia_despesas').get().n;
    if (!temDespesas) {return true;}
    // COUNT(*) em FTS external-content lê a content table (falso positivo) —
    // só um MATCH real prova que o índice está populado.
    const termosComuns = ['pagamento', 'valor', 'referente', 'empenha'];
    for (const termo of termosComuns) {
      const n = db.prepare('SELECT COUNT(*) n FROM despesas_fts WHERE despesas_fts MATCH ?').get(termo).n;
      if (n > 0) {return true;}
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Inicializa o índice se necessário (chamado no startup do server).
 */
function ensureDespesasFtsIndex() {
  ensureDespesasFtsSchema();
  if (!isDespesasFtsReady()) {
    return { rebuiltRows: rebuildDespesasFtsIndex() };
  }
  return { rebuiltRows: 0 };
}

module.exports = {
  ensureDespesasFtsIndex,
  rebuildDespesasFtsIndex,
};
