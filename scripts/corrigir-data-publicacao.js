'use strict';

/**
 * Corrige data_publicacao de documentos da prefeitura onde ela está FUTURA (era a
 * data de sessão da listagem, não a de publicação) ou nula. Usa a datahora do
 * anexo (quando o arquivo foi publicado no site) como data_publicacao real, e
 * move a data futura para data_abertura quando esta estiver vazia.
 *
 * Reentrante. Dry-run por padrão. Uso:
 *   node scripts/corrigir-data-publicacao.js
 *   node scripts/corrigir-data-publicacao.js --apply
 */

process.loadEnvFile?.() || require('dotenv').config();

const { setupDatabase } = require('../src/db/setup');
const { db } = require('../src/db');
const { parseDataBrasileira, naoFutura } = require('../src/utils/datas');

function parseArgs(argv) {
  return { apply: argv.includes('--apply') };
}

function datahoraAnexo(dadosExtras) {
  let extras;
  try {
    extras = JSON.parse(dadosExtras || '{}');
  } catch {
    return null;
  }
  const anexos = Array.isArray(extras.anexos) ? extras.anexos : [];
  return anexos
    .map((a) => parseDataBrasileira(a && a.datahora))
    .filter(Boolean)
    .sort()[0] || null;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  setupDatabase();
  const hoje = new Date().toISOString().slice(0, 10);

  const docs = db
    .prepare(
      `SELECT id, tipo, data_publicacao, data_abertura, dados_extras
         FROM documentos
        WHERE fonte = 'site_prefeitura'
          AND (data_publicacao IS NULL OR data_publicacao > ?)`
    )
    .all(hoje);

  const update = db.prepare(
    'UPDATE documentos SET data_publicacao = @dp, data_abertura = @da WHERE id = @id'
  );

  const cont = { corrigidos: 0, sem_anexo: 0 };
  console.warn(`Candidatos (data_publicacao nula/futura): ${docs.length}${opts.apply ? '' : ' (dry-run)'}\n`);
  for (const d of docs) {
    const pub = datahoraAnexo(d.dados_extras);
    const futura = d.data_publicacao && naoFutura(d.data_publicacao, new Date()) === null ? d.data_publicacao : null;
    if (!pub) {
      cont.sem_anexo += 1;
      console.warn(`  #${d.id} — sem datahora de anexo (mantém)`);
      continue;
    }
    const novaAbertura = d.data_abertura || futura || null;
    cont.corrigidos += 1;
    console.warn(`  #${d.id} — pub ${d.data_publicacao || 'null'} → ${pub} · abertura → ${novaAbertura || 'null'}`);
    if (opts.apply) {
      update.run({ id: d.id, dp: pub, da: novaAbertura });
    }
  }

  console.warn(`\n${opts.apply ? 'Aplicado' : 'Dry-run'} — corrigidos: ${cont.corrigidos} · sem anexo: ${cont.sem_anexo}`);
}

main();
