'use strict';

/**
 * Migrações runtime de transparencia_despesas: colunas derivadas de
 * dados_extras (credor_cargo, co_tce) e identidade de credor (credor_chave).
 * Bancos novos já nascem com as colunas (schema.sql / ensureTransparenciaSchema);
 * aqui é ALTER TABLE pra bancos existentes + backfill das ~29,7k linhas.
 */

const { db } = require('./index');
const logger = require('../logger');
const { buildCredorChave } = require('../transparencia/credor-chave');

/** @returns {boolean} true quando a coluna foi adicionada agora */
function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.length) {return false;}
  if (columns.some((item) => item.name === column)) {return false;}
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  return true;
}

function backfillCargoETce() {
  const r = db.prepare(`
    UPDATE transparencia_despesas
    SET credor_cargo = NULLIF(TRIM(json_extract(dados_extras, '$.cargo')), ''),
        co_tce       = NULLIF(TRIM(json_extract(dados_extras, '$.coTce')), '')
    WHERE dados_extras IS NOT NULL AND json_valid(dados_extras)
  `).run();
  return r.changes;
}

function backfillCredorChave() {
  // PJ direto em SQL; PF precisa do slug (JS), uma passada por nome distinto.
  const pj = db.prepare(`
    UPDATE transparencia_despesas
    SET credor_chave = REPLACE(REPLACE(REPLACE(REPLACE(credor_cnpj, '.', ''), '/', ''), '-', ''), ' ', '')
    WHERE credor_cnpj IS NOT NULL AND credor_cnpj != '' AND credor_chave IS NULL
  `).run();

  const nomes = db.prepare(`
    SELECT DISTINCT credor_nome
    FROM transparencia_despesas
    WHERE (credor_cnpj IS NULL OR credor_cnpj = '')
      AND credor_nome IS NOT NULL AND credor_nome != ''
      AND credor_chave IS NULL
  `).all();

  const updatePf = db.prepare(`
    UPDATE transparencia_despesas
    SET credor_chave = ?
    WHERE credor_nome = ? AND (credor_cnpj IS NULL OR credor_cnpj = '') AND credor_chave IS NULL
  `);

  let pf = 0;
  db.exec('BEGIN');
  try {
    for (const row of nomes) {
      const chave = buildCredorChave({ cnpj: null, nome: row.credor_nome });
      if (!chave) {continue;}
      pf += updatePf.run(chave, row.credor_nome).changes;
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return pj.changes + pf;
}

function backfillColunasDerivadas() {
  const atualizadas = backfillCargoETce() + backfillCredorChave();
  return { atualizadas };
}

function ensureDespesasMigracoes() {
  const adicionou =
    [
      ensureColumn('transparencia_despesas', 'credor_cargo', 'TEXT'),
      ensureColumn('transparencia_despesas', 'co_tce', 'TEXT'),
      ensureColumn('transparencia_despesas', 'credor_chave', 'TEXT'),
    ].some(Boolean);

  db.exec('CREATE INDEX IF NOT EXISTS idx_transp_despesas_credor_chave ON transparencia_despesas(credor_chave);');

  // Backfill só quando alguma coluna acabou de nascer — "existe NULL" não
  // serve de guarda (PJ tem cargo NULL legítimo pra sempre).
  if (adicionou) {
    const { atualizadas } = backfillColunasDerivadas();
    logger.info('transparencia-migracoes: backfill de colunas derivadas concluído', { atualizadas });
  }
}

module.exports = { ensureColumn, backfillColunasDerivadas, ensureDespesasMigracoes };
