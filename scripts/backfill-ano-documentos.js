'use strict';

/**
 * Preenche a coluna `ano` de documentos onde ela ficou nula mas o ano é
 * derivável (título, número, datas ou — em último caso — o início do texto).
 * Corrige o grupo "Sem ano" no acervo para documentos que têm, sim, o ano nos
 * próprios dados.
 *
 * Reentrante. Dry-run por padrão. Uso:
 *   node scripts/backfill-ano-documentos.js
 *   node scripts/backfill-ano-documentos.js --apply
 */

process.loadEnvFile?.() || require('dotenv').config();

const { setupDatabase } = require('../src/db/setup');
const { db } = require('../src/db');
const { extrairAno } = require('../src/utils/datas');

function parseArgs(argv) {
  return { apply: argv.includes('--apply') };
}

function derivarAno(doc) {
  // 1. Sinais confiáveis: datas, número, título.
  const direto = extrairAno({
    dataPublicacao: doc.data_publicacao,
    dataAbertura: doc.data_abertura,
    numero: doc.numero,
    titulo: doc.titulo,
  });
  if (direto) {
    return { ano: direto, origem: 'titulo/numero/data' };
  }
  // 2. Último recurso: início do texto (ex.: "RESOLUÇÃO N. 01/2025").
  const snippet = String(doc.texto_completo || '').slice(0, 600);
  const doTexto = extrairAno({ titulo: snippet });
  if (doTexto) {
    return { ano: doTexto, origem: 'texto' };
  }
  return { ano: null, origem: null };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  setupDatabase();

  const docs = db
    .prepare(
      `SELECT id, fonte, tipo, titulo, numero, data_publicacao, data_abertura, texto_completo
         FROM documentos WHERE ano IS NULL`
    )
    .all();

  const update = db.prepare('UPDATE documentos SET ano = @ano WHERE id = @id');
  const cont = { preenchidos: 0, sem_ano: 0 };

  console.warn(`Documentos com ano nulo: ${docs.length}${opts.apply ? '' : ' (dry-run)'}\n`);
  for (const d of docs) {
    const { ano, origem } = derivarAno(d);
    if (ano) {
      cont.preenchidos += 1;
      console.warn(`  #${d.id} → ${ano} (${origem}) · ${(d.titulo || '').slice(0, 55)}`);
      if (opts.apply) {
        update.run({ id: d.id, ano });
      }
    } else {
      cont.sem_ano += 1;
      console.warn(`  #${d.id} → SEM ANO (mantém) · ${(d.titulo || '').slice(0, 55)}`);
    }
  }

  console.warn(
    `\n${opts.apply ? 'Aplicado' : 'Dry-run'} — preenchidos: ${cont.preenchidos} · sem ano real: ${cont.sem_ano}`
  );
}

main();
