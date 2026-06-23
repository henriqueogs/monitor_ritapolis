/**
 * Gera resumos IA para documentos pendentes, ano a ano, com pausa entre anos.
 * Usa summarizePendingDocuments que já faz rate limiting entre docs.
 *
 * Uso:
 *   node scripts/resumir-todos-por-ano.js [--anos=2020,2021,2022] [--limite-por-ano=30]
 *                                          [--delay-entre-docs=45] [--delay-entre-anos=120]
 *                                          [--tipo=edital] [--dry-run]
 *
 * Defaults seguros para NVIDIA (2 req/min):
 *   limite-por-ano=30, delay-entre-docs=45s, delay-entre-anos=120s
 */

process.loadEnvFile?.() || require('dotenv').config();

const { summarizePendingDocuments } = require('../src/ai/summarize-pending-documents');

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);

const ANOS_PARAM = args.anos ? String(args.anos).split(',').map(Number) : null;
const LIMITE_POR_ANO = Number(args['limite-por-ano'] || 30);
const DELAY_ENTRE_DOCS_S = Number(args['delay-entre-docs'] || 45);
const DELAY_ENTRE_ANOS_S = Number(args['delay-entre-anos'] || 120);
const TIPO = args.tipo || 'edital';
const DRY_RUN = Boolean(args['dry-run']);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const { DatabaseSync } = require('node:sqlite');
  const config = require('../src/config');
  const db = new DatabaseSync(config.dbPath);

  const anosDisponiveis = db
    .prepare("SELECT DISTINCT ano FROM documentos WHERE tipo = ? AND ano IS NOT NULL ORDER BY ano ASC")
    .all(TIPO)
    .map((r) => r.ano);

  const anos = ANOS_PARAM || anosDisponiveis;

  console.log(`[IA] Resumo por ano — ${anos.length} anos, ${LIMITE_POR_ANO} docs/ano, ${DELAY_ENTRE_DOCS_S}s entre docs, ${DELAY_ENTRE_ANOS_S}s entre anos`);
  if (DRY_RUN) {console.log('[IA] Modo dry-run — nenhuma chamada de IA será feita.\n');}

  const totais = { anos: 0, selecionados: 0, ok: 0, erro: 0, pulados: 0 };

  for (const ano of anos) {
    console.log(`\n[IA] Ano ${ano}...`);

    const result = await summarizePendingDocuments({
      ano: String(ano),
      tipo: TIPO,
      limite: LIMITE_POR_ANO,
      concorrencia: 1,
      delayBetweenDocsMs: DELAY_ENTRE_DOCS_S * 1000,
      dryRun: DRY_RUN
    });

    totais.anos++;
    totais.selecionados += result.total_selecionados || 0;
    totais.ok += result.total_ok || 0;
    totais.erro += result.total_erro || 0;

    if (result.dry_run) {
      console.log(`  Pendentes: ${result.total_selecionados}`);
      for (const c of (result.candidatos || [])) {
        console.log(`  #${c.documento_id} | ${c.texto_chars} chars | ${c.titulo?.slice(0, 60)}`);
      }
    } else {
      console.log(`  Selecionados: ${result.total_selecionados} | OK: ${result.total_ok} | Erros: ${result.total_erro}`);
    }

    if (!DRY_RUN && result.total_selecionados > 0 && ano !== anos[anos.length - 1]) {
      console.log(`  Aguardando ${DELAY_ENTRE_ANOS_S}s antes do próximo ano...`);
      await sleep(DELAY_ENTRE_ANOS_S * 1000);
    }
  }

  console.log(`\n[IA] Concluído — ${totais.anos} anos | ${totais.selecionados} selecionados | ${totais.ok} OK | ${totais.erro} erros`);
}

main().catch((err) => {
  console.error('Erro fatal:', err.message);
  process.exit(1);
});
