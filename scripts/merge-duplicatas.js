'use strict';

/**
 * Merge de uploads duplicados — documentos distintos que representam o MESMO
 * edital, enviados ao portal mais de uma vez (mesmo processo, mesmo grupo,
 * ambos com papel 'edital', texto quase idêntico, mas url_pdf diferente).
 *
 * Para cada par [keeper, loser]:
 *   1. Move os anexos do loser para o keeper (urls distintas → sem conflito).
 *   2. Registra a procedência do loser (url_origem/url_pdf) em documentos_fontes
 *      do keeper, preservando o rastro do segundo upload.
 *   3. Deleta o loser (CASCADE remove detalhes/grupo/fontes órfãos do loser).
 *
 * Pares validados manualmente (ver CURRENT_WORK.md 1.3). O par 371/372 foi
 * deliberadamente EXCLUÍDO: não é duplicata (371=ata, 372=edital do mesmo processo).
 *
 * Uso:
 *   node scripts/merge-duplicatas.js            # dry-run
 *   node scripts/merge-duplicatas.js --apply    # efetiva
 */

const { setupDatabase } = require('../src/db/setup');
const { db } = require('../src/db');

// [keeper, loser]
const PARES = [
  [519, 520],
  [517, 518],
  [513, 593],
  [373, 374],
];

function snapshot(id) {
  const cnt = (t) => db.prepare(`SELECT COUNT(*) n FROM ${t} WHERE documento_id = ?`).get(id).n;
  return { anexos: cnt('documentos_anexos'), produtos: cnt('licitacoes_produtos') };
}

function planejar() {
  return PARES.map(([keeper, loser]) => {
    const k = db.prepare('SELECT id, numero, ano FROM documentos WHERE id = ?').get(keeper);
    const l = db.prepare('SELECT id, numero, ano, fonte, url_origem, url_pdf, hash_conteudo FROM documentos WHERE id = ?').get(loser);
    return { keeper: k, loser: l, snapKeeper: snapshot(keeper), snapLoser: snapshot(loser) };
  });
}

function aplicarMerge({ keeper, loser }) {
  // 1. Reparentar anexos do loser → keeper (urls distintas; guard contra conflito de UNIQUE)
  const anexosLoser = db
    .prepare('SELECT id, url FROM documentos_anexos WHERE documento_id = ?')
    .all(loser.id);
  const moveAnexo = db.prepare('UPDATE documentos_anexos SET documento_id = @keeper WHERE id = @id');
  const dropAnexo = db.prepare('DELETE FROM documentos_anexos WHERE id = ?');
  for (const ax of anexosLoser) {
    const jaExiste = db
      .prepare('SELECT 1 FROM documentos_anexos WHERE documento_id = ? AND url = ?')
      .get(keeper.id, ax.url);
    if (jaExiste) {
      dropAnexo.run(ax.id);
    } else {
      moveAnexo.run({ keeper: keeper.id, id: ax.id });
    }
  }

  // 2. Procedência do loser → documentos_fontes do keeper
  db.prepare(
    `INSERT OR IGNORE INTO documentos_fontes (documento_id, fonte, url_origem, url_pdf, hash_conteudo)
     VALUES (@documento_id, @fonte, @url_origem, @url_pdf, @hash_conteudo)`
  ).run({
    documento_id: keeper.id,
    fonte: loser.fonte,
    url_origem: loser.url_origem || '',
    url_pdf: loser.url_pdf || '',
    hash_conteudo: loser.hash_conteudo || null,
  });

  // 3. Deletar o loser (CASCADE limpa detalhes/grupo/fontes/anexos remanescentes)
  db.prepare('DELETE FROM documentos WHERE id = ?').run(loser.id);
}

function main() {
  const apply = process.argv.includes('--apply');
  setupDatabase();

  const plano = planejar();
  console.warn(`Pares a fundir: ${plano.length}`);
  for (const p of plano) {
    console.warn(
      `  keeper #${p.keeper.id} (${p.snapKeeper.anexos}ax/${p.snapKeeper.produtos}prod) ← loser #${p.loser.id} (${p.snapLoser.anexos}ax/${p.snapLoser.produtos}prod) [${p.loser.numero}/${p.loser.ano}]`
    );
  }

  if (!apply) {
    console.warn('\nDry-run. Nada gravado. Rode com --apply para efetivar.');
    return;
  }

  db.exec('BEGIN');
  try {
    for (const p of plano) {
      aplicarMerge(p);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  console.warn(`\n${plano.length} duplicatas fundidas.`);
}

main();
