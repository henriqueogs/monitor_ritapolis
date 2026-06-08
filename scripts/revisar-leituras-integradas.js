#!/usr/bin/env node

const { db, parseJson } = require('../src/db');
const { normalizeSavedIntegratedReading } = require('../src/ai/correlate-licitation');

function parseArgs(argv) {
  const args = {
    ano: null,
    documentoId: null,
    dryRun: false
  };

  for (const arg of argv) {
    if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg.startsWith('--ano=')) {
      args.ano = Number(arg.slice('--ano='.length));
    } else if (arg.startsWith('--documento-id=')) {
      args.documentoId = Number(arg.slice('--documento-id='.length));
    }
  }

  return args;
}

function listLatestIntegratedReadings({ ano, documentoId }) {
  return db
    .prepare(
      `SELECT r.*, d.ano
       FROM documentos_resumos_ai r
       JOIN documentos d ON d.id = r.documento_id
       WHERE r.status = 'ok'
         AND r.provider <> 'mock'
         AND r.contrato_versao = '2.0'
         AND (@ano IS NULL OR d.ano = @ano)
         AND (@documentoId IS NULL OR d.id = @documentoId)
         AND r.id = (
           SELECT r2.id
           FROM documentos_resumos_ai r2
           WHERE r2.documento_id = r.documento_id
             AND r2.status = 'ok'
             AND r2.provider <> 'mock'
             AND r2.contrato_versao = '2.0'
           ORDER BY datetime(r2.criado_em) DESC, r2.id DESC
           LIMIT 1
         )
       ORDER BY d.ano DESC, d.id ASC`
    )
    .all({
      ano: Number.isFinite(ano) ? ano : null,
      documentoId: Number.isFinite(documentoId) ? documentoId : null
    });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const rows = listLatestIntegratedReadings(args);
  const update = db.prepare(
    `UPDATE documentos_resumos_ai
     SET resumo_json = @resumo_json,
         atualizado_em = @atualizado_em
     WHERE id = @id`
  );
  const now = new Date().toISOString();
  const revisados = [];
  const erros = [];

  for (const row of rows) {
    try {
      const original = parseJson(row.resumo_json);
      const normalized = normalizeSavedIntegratedReading(row.documento_id, original);
      const originalJson = JSON.stringify(original);
      const normalizedJson = JSON.stringify(normalized);

      if (originalJson !== normalizedJson) {
        revisados.push(row.documento_id);
        if (!args.dryRun) {
          update.run({
            id: row.id,
            resumo_json: normalizedJson,
            atualizado_em: now
          });
        }
      }
    } catch (error) {
      erros.push({
        documento_id: row.documento_id,
        erro: error.message
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        avaliados: rows.length,
        atualizados: args.dryRun ? 0 : revisados.length,
        alterariam: args.dryRun ? revisados.length : undefined,
        documento_ids: revisados,
        erros
      },
      null,
      2
    )
  );

  if (erros.length) {
    process.exitCode = 1;
  }
}

main();
