'use strict';

/**
 * Re-extrai o texto de documentos com o extractor de PDF atual (geometria) —
 * aplica a melhoria a registros já gravados que ficaram com números/tabelas
 * quebrados. Só sobrescreve quando o PDF está vivo e devolve texto não-vazio
 * (nunca troca texto existente por vazio).
 *
 * Detecta candidatos pelo padrão de número quebrado (R$ com dígitos espaçados),
 * ou aceita --documento-id=N. Dry-run por padrão.
 *
 * Uso:
 *   node scripts/reextrair-texto-docs.js                 # dry-run (lista)
 *   node scripts/reextrair-texto-docs.js --apply
 *   node scripts/reextrair-texto-docs.js --documento-id=243 --apply
 */

process.loadEnvFile?.() || require('dotenv').config();

const axios = require('axios');
const { setupDatabase } = require('../src/db/setup');
const { db } = require('../src/db');
const { extractPdfText } = require('../src/parsers/pdf');
const { resumirTextoLimpo } = require('../src/utils/text');
const config = require('../src/config');

const RE_NUMERO_QUEBRADO = /R\$\s*\d{1,3}(\s+[.,]\s*|\s+)\d{3}/;

function parseArgs(argv) {
  const o = { apply: false, documentoId: null };
  for (const a of argv) {
    if (a === '--apply') {o.apply = true;}
    else if (a.startsWith('--documento-id=')) {o.documentoId = Number(a.split('=')[1]);}
  }
  return o;
}

function listarCandidatos(documentoId) {
  if (documentoId) {
    return db.prepare('SELECT id, url_pdf, texto_completo FROM documentos WHERE id = ?').all(documentoId);
  }
  return db
    .prepare("SELECT id, url_pdf, texto_completo FROM documentos WHERE texto_completo LIKE '%R$%'")
    .all()
    .filter((d) => RE_NUMERO_QUEBRADO.test(d.texto_completo || ''));
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  setupDatabase();

  const candidatos = listarCandidatos(opts.documentoId);
  console.warn(`Documentos candidatos a re-extração: ${candidatos.length}`);

  const update = db.prepare(
    "UPDATE documentos SET texto_completo = @texto, resumo = @resumo, atualizado_em = CURRENT_TIMESTAMP WHERE id = @id"
  );
  // Regenera a coluna resumo (truncagem limpa) junto com o texto — evita resumo
  // antigo/quebrado preso após melhoria de extração; pula ruído de cabeçalho.
  const resumirTexto = resumirTextoLimpo;

  const cont = { atualizados: 0, pdf_morto: 0, sem_url: 0, sem_ganho: 0 };
  for (const d of candidatos) {
    const url = (d.url_pdf || '').startsWith('http') ? d.url_pdf : null;
    if (!url) {
      cont.sem_url += 1;
      console.warn(`  #${d.id} — sem url_pdf viva (mantém)`);
      continue;
    }
    try {
      const buf = Buffer.from(
        (await axios.get(url, { responseType: 'arraybuffer', timeout: config.collectorTimeoutMs * 2 })).data
      );
      if (!buf.length) {
        cont.pdf_morto += 1;
        console.warn(`  #${d.id} — PDF vazio na fonte (mantém)`);
        continue;
      }
      const r = await extractPdfText(buf);
      const novo = (r.text || '').trim();
      const aindaQuebrado = RE_NUMERO_QUEBRADO.test(novo);
      if (novo.length < 50) {
        cont.pdf_morto += 1;
        console.warn(`  #${d.id} — texto novo vazio/curto (mantém)`);
        continue;
      }
      console.warn(`  #${d.id} — ${novo.length} chars, número quebrado: ${aindaQuebrado ? 'AINDA' : 'corrigido'}`);
      if (opts.apply) {
        update.run({ id: d.id, texto: novo, resumo: resumirTexto(novo) });
        cont.atualizados += 1;
      } else {
        cont.sem_ganho += 0;
      }
    } catch (err) {
      cont.pdf_morto += 1;
      console.warn(`  #${d.id} — falha ao baixar (mantém): ${err.message.slice(0, 50)}`);
    }
  }

  console.warn(
    `\n${opts.apply ? 'Aplicado' : 'Dry-run'} — atualizados: ${cont.atualizados} · PDF morto/vazio: ${cont.pdf_morto} · sem url: ${cont.sem_url}`
  );
}

main().catch((e) => {
  console.error(`Falha: ${e.message}`);
  process.exitCode = 1;
});
