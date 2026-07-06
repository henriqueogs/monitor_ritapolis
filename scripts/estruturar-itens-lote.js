'use strict';

/**
 * Backfill controlado da reextração de itens via IA (Fase G). Por padrão
 * roda em modo dry-run (só mostra o que seria enfileirado); use --apply pra
 * de fato enfileirar e processar.
 *
 * Uso:
 *   node scripts/estruturar-itens-lote.js                       # dry-run, 20 docs mais recentes
 *   node scripts/estruturar-itens-lote.js --limite=100 --apply
 *   node scripts/estruturar-itens-lote.js --documento=605 --apply
 *   node scripts/estruturar-itens-lote.js --ano=2026 --apply
 *   node scripts/estruturar-itens-lote.js --documento=5 --force --apply  # reprocessa mesmo sem mudança no texto
 */

process.loadEnvFile?.() || require('dotenv').config();

const { setupDatabase } = require('../src/db/setup');
const { enfileirarItensPendentes } = require('../src/ai/enfileirar-itens-pendentes');
const { runPendingItensEstruturacaoJobs } = require('../src/ai/itens-processo-job-worker');
const { getItensEstruturacaoJobById } = require('../src/db/itens-estruturacao-jobs-repo');

function readFlag(name) {
  const prefix = `--${name}=`;
  const arg = process.argv.slice(2).find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : null;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const force = process.argv.includes('--force');
  const limite = Number(readFlag('limite') || 20);
  const ano = readFlag('ano') || undefined;
  const fonte = readFlag('fonte') || undefined;
  const documentoFlag = readFlag('documento');
  const documentoId = documentoFlag ? Number(documentoFlag) : null;

  setupDatabase();

  const resultado = await enfileirarItensPendentes({
    limite,
    ano,
    fonte,
    documentoId,
    force,
    dryRun: !apply,
  });

  console.log(`Selecionados: ${resultado.total_selecionados} | apply=${apply} | force=${force}`);
  console.log(`Já processados (mesmo texto, pulados): ${resultado.ja_processados.length}`);
  console.log(`${apply ? 'Enfileirados' : 'Seriam enfileirados'}: ${resultado.enfileirados.length}`);
  for (const item of resultado.enfileirados) {
    console.log(`  #${item.documento_id} ${item.titulo || ''}`.trimEnd());
  }

  if (!apply) {
    console.log('\nModo dry-run: nenhum job foi criado, nenhuma chamada de IA foi feita. Rode com --apply pra processar de verdade.');
    return;
  }

  if (!resultado.enfileirados.length) {
    console.log('\nNada pra processar.');
    return;
  }

  console.log('\nProcessando fila (um documento por vez, respeitando rate limit)...');
  await runPendingItensEstruturacaoJobs();

  const jobsFinais = resultado.enfileirados.map((item) => getItensEstruturacaoJobById(item.job_id)).filter(Boolean);
  const comErro = jobsFinais.filter((job) => job.status === 'erro');
  const ok = jobsFinais.filter((job) => job.status === 'ok');
  console.log(`\nConcluído: ok=${ok.length} erro=${comErro.length}`);
  for (const job of comErro) {
    console.log(`  #${job.documento_id} erro: ${job.erro}`);
  }
}

main().catch((error) => {
  console.error(`Backfill de itens falhou: ${error.message}`);
  process.exitCode = 1;
});
