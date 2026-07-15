'use strict';

const { db } = require('../src/db');
const { backfillClassificacoesDespesas } = require('../src/db/transparencia-repo');
const { CLASSIFICACAO_FINALIDADE_VERSAO } = require('../src/transparencia/finalidade');

function parseArgs(argv) {
  const args = {
    apply: false,
    force: false,
    limite: null,
  };
  for (const arg of argv) {
    if (arg === '--apply') {
      args.apply = true;
    } else if (arg === '--force') {
      args.force = true;
    } else if (arg.startsWith('--limite=')) {
      args.limite = Number(arg.split('=')[1]) || null;
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.apply) {
    console.log('[DRY-RUN] Nenhuma classificacao sera gravada. Use --apply para persistir.');
    const params = [];
    const where = args.force
      ? ''
      : 'WHERE tdc.id IS NULL OR tdc.versao != ?';
    if (!args.force) {
      params.push(CLASSIFICACAO_FINALIDADE_VERSAO);
    }
    const pendentes = db.prepare(`
      SELECT COUNT(*) AS n
      FROM transparencia_despesas td
      LEFT JOIN transparencia_despesas_classificacoes tdc ON tdc.despesa_id = td.id
      ${where}
    `).get(...params).n;
    console.log(JSON.stringify({
      versao: CLASSIFICACAO_FINALIDADE_VERSAO,
      dry_run: true,
      force: args.force,
      limite: args.limite,
      pendentes,
    }, null, 2));
    return;
  }

  const resultado = backfillClassificacoesDespesas({ limite: args.limite, force: args.force });
  console.log(JSON.stringify({ ...resultado, dry_run: false }, null, 2));
}

main();
