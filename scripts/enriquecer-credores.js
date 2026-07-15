'use strict';

/**
 * Enriquece credores PJ com dados cadastrais da Receita (BrasilAPI).
 * Uso:
 *   node scripts/enriquecer-credores.js                 # dry-run (só conta)
 *   node scripts/enriquecer-credores.js --apply         # aplica (padrão 100)
 *   node scripts/enriquecer-credores.js --apply --limite=628 --force
 */

const { listCnpjsParaEnriquecer } = require('../src/db/credores-repo');
const { enriquecerCredores } = require('../src/integracoes/enriquecer-credores');
const config = require('../src/config');

function parseArgs(argv) {
  const args = { apply: false, force: false, limite: 100 };
  for (const arg of argv) {
    if (arg === '--apply') { args.apply = true; }
    else if (arg === '--force') { args.force = true; }
    else if (arg.startsWith('--limite=')) { args.limite = Number(arg.split('=')[1]) || args.limite; }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.apply) {
    const pendentes = listCnpjsParaEnriquecer({
      limite: 100000,
      maxIdadeDias: config.credorEnriquecimentoIntervalDias,
      force: args.force,
    });
    console.log('[DRY-RUN] Use --apply para consultar a Receita e gravar o cache.');
    console.log(JSON.stringify({ dry_run: true, force: args.force, pendentes: pendentes.length }, null, 2));
    return;
  }

  const resumo = await enriquecerCredores({ limite: args.limite, force: args.force });
  console.log(JSON.stringify({ ...resumo, dry_run: false }, null, 2));
}

main().catch((err) => {
  console.error('enriquecer-credores falhou:', err.message);
  process.exit(1);
});
