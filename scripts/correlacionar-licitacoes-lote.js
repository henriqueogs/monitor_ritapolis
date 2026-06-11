'use strict';

/**
 * Lote de leitura integrada (contrato 2.0) — gera a "Análise do Processo" para
 * todos os editais elegíveis de um intervalo de anos.
 *
 * Elegível: tipo='edital', pertence a um grupo de processo e ainda não tem
 * leitura integrada (contrato 2.x) com status ok. O cache por texto_hash do
 * correlateLicitation evita retrabalho se o lote for interrompido e reiniciado.
 *
 * Uso:
 *   node scripts/correlacionar-licitacoes-lote.js --de=2023 --ate=2025
 *   node scripts/correlacionar-licitacoes-lote.js --de=2024 --ate=2024 --limite=10
 *   Opções: --delay-ms=5000 (pausa entre docs) --force (regera mesmo com cache)
 */

const { setupDatabase } = require('../src/db/setup');
const { db } = require('../src/db');
const { correlateLicitation, CONTRACT_VERSION } = require('../src/ai/correlate-licitation');
const { createAiProvider } = require('../src/ai/providers');

const DELAY_PADRAO_MS = 5000;

function parseArgs(argv) {
  const options = {
    anoDe: null,
    anoAte: null,
    limite: null,
    delayMs: DELAY_PADRAO_MS,
    force: false,
  };

  argv.forEach((arg) => {
    if (arg === '--force') {
      options.force = true;
      return;
    }
    if (arg.startsWith('--de=')) {
      options.anoDe = Number(arg.split('=')[1]);
      return;
    }
    if (arg.startsWith('--ate=')) {
      options.anoAte = Number(arg.split('=')[1]);
      return;
    }
    if (arg.startsWith('--limite=')) {
      options.limite = Number(arg.split('=')[1]);
      return;
    }
    if (arg.startsWith('--delay-ms=')) {
      options.delayMs = Number(arg.split('=')[1]);
    }
  });

  if (!Number.isFinite(options.anoDe) || !Number.isFinite(options.anoAte)) {
    throw new Error('Informe --de=YYYY e --ate=YYYY');
  }

  return options;
}

function listarElegiveis({ anoDe, anoAte, limite, force }) {
  const filtroLeitura = force
    ? ''
    : `AND NOT EXISTS (
         SELECT 1 FROM documentos_resumos_ai r
         WHERE r.documento_id = d.id AND r.contrato_versao LIKE '2.%' AND r.status = 'ok'
       )`;

  const limitClause = Number.isFinite(limite) && limite > 0 ? 'LIMIT @limite' : '';
  const params = { anoDe, anoAte };
  if (limitClause) {
    params.limite = limite;
  }

  return db
    .prepare(
      `SELECT d.id, d.ano, d.numero
         FROM documentos d
        WHERE d.tipo = 'edital'
          AND d.ano BETWEEN @anoDe AND @anoAte
          AND EXISTS (SELECT 1 FROM licitacoes_grupo_documentos g WHERE g.documento_id = d.id)
          ${filtroLeitura}
        ORDER BY d.ano DESC, d.id DESC
        ${limitClause}`
    )
    .all(params);
}

function aguardar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  setupDatabase();

  const docs = listarElegiveis(options);
  console.warn(
    `Lote de leitura integrada (contrato ${CONTRACT_VERSION}): ${docs.length} documentos (${options.anoDe}–${options.anoAte})`
  );

  const provider = createAiProvider();
  const inicio = Date.now();
  let ok = 0;
  let reutilizados = 0;
  let erros = 0;

  for (let i = 0; i < docs.length; i += 1) {
    const doc = docs[i];
    const progresso = `[${i + 1}/${docs.length}]`;

    try {
      const result = await correlateLicitation(doc.id, { provider, force: options.force });
      if (result.reutilizado) {
        reutilizados += 1;
        console.warn(`${progresso} doc #${doc.id} (${doc.ano}) — reutilizado (cache)`);
      } else {
        ok += 1;
        console.warn(
          `${progresso} doc #${doc.id} (${doc.ano}) — ok (confianca ${result.confianca ?? '—'})`
        );
      }
    } catch (err) {
      erros += 1;
      console.error(`${progresso} doc #${doc.id} (${doc.ano}) — ERRO: ${err.message}`);
    }

    if (i < docs.length - 1) {
      await aguardar(options.delayMs);
    }
  }

  const minutos = ((Date.now() - inicio) / 60000).toFixed(1);
  console.warn(
    `\nLote concluído em ${minutos} min — geradas: ${ok} · cache: ${reutilizados} · erros: ${erros}`
  );

  if (erros > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`Lote abortado: ${error.message}`);
  process.exitCode = 1;
});
