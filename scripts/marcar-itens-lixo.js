'use strict';

/**
 * Marca linhas-lixo de licitacoes_produtos (fragmentos de OCR sem descrição
 * real) como rejeitadas — não destrutivo, idempotente, reversível.
 *
 * Uso:
 *   node scripts/marcar-itens-lixo.js [--documento=N]        # dry-run
 *   node scripts/marcar-itens-lixo.js --apply
 */

process.loadEnvFile?.() || require('dotenv').config();

const { setupDatabase } = require('../src/db/setup');
const { marcarItensLixo } = require('../src/db/produtos-qualidade-repo');

function readFlag(name) {
  const prefix = `--${name}=`;
  const arg = process.argv.slice(2).find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : null;
}

function main() {
  const apply = process.argv.includes('--apply');
  const documento = readFlag('documento');

  setupDatabase();
  const r = marcarItensLixo({ documentoId: documento ? Number(documento) : undefined, dryRun: !apply });

  console.warn(
    `${apply ? '' : '[dry-run] '}avaliados=${r.avaliados} lixo=${r.lixo} marcados=${r.marcados} ja_marcados=${r.ja_marcados}`
  );
  for (const e of r.exemplos) {
    console.warn(`  #${e.id} doc${e.documento_id} [${e.motivo}] "${String(e.descricao).slice(0, 60)}"`);
  }
}

main();
