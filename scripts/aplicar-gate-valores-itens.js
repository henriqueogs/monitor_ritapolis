'use strict';

/**
 * Gate de plausibilidade item×processo: quarentena produtos cujo valor final
 * excede o valor final do próprio processo (status_revisao='rejeitado' +
 * validação 'implausivel' + anotação rastreável). Valores ficam intactos.
 *
 * Uso:
 *   node scripts/aplicar-gate-valores-itens.js [--ano=YYYY] [--documento=N]   # dry-run
 *   node scripts/aplicar-gate-valores-itens.js --all --apply
 */

process.loadEnvFile?.() || require('dotenv').config();

const { setupDatabase } = require('../src/db/setup');
const { aplicarGatePlausibilidadeItemProcesso } = require('../src/db/produtos-plausibilidade-repo');

function readFlag(name) {
  const prefix = `--${name}=`;
  const arg = process.argv.slice(2).find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : null;
}

function main() {
  const apply = process.argv.includes('--apply');
  const all = process.argv.includes('--all');
  const ano = readFlag('ano');
  const documento = readFlag('documento');

  if (!all && !ano && !documento) {
    console.warn('Informe --all, --ano=YYYY ou --documento=N. (--apply para gravar; padrão dry-run)');
    process.exitCode = 1;
    return;
  }

  setupDatabase();
  const resultado = aplicarGatePlausibilidadeItemProcesso({
    documentoId: documento ? Number(documento) : undefined,
    ano: ano ? Number(ano) : undefined,
    dryRun: !apply,
  });

  console.warn(
    `${apply ? '' : '[dry-run] '}avaliados=${resultado.avaliados} quarentenados=${resultado.quarentenados} ` +
      `ja_quarentenados=${resultado.ja_quarentenados} liberados=${resultado.liberados}`
  );
  for (const d of resultado.detalhes) {
    console.warn(
      `  produto #${d.produto_id} (doc ${d.documento_id}) ${d.campo}=R$ ${Number(d.valor_item).toLocaleString('pt-BR')} ` +
        `vs processo R$ ${Number(d.valor_processo).toLocaleString('pt-BR')} (${d.razao}x)`
    );
  }
}

main();
