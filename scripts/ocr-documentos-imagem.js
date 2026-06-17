'use strict';

/**
 * OCR local (sem IA) dos editais cujo PDF principal é escaneado
 * (status_coleta='imagem') — preenche documentos.texto_completo, tornando-os
 * elegíveis para resumo IA e análise integrada (cascata de cobertura).
 *
 * texto reconhecido → status_coleta='ok' + dados_extras.texto_origem='ocr'
 * (procedência preservada). Scan ilegível → mantém 'imagem'.
 *
 * Reentrante e chunkável. Uso:
 *   node scripts/ocr-documentos-imagem.js                 # dry-run
 *   node scripts/ocr-documentos-imagem.js --apply --limite=15
 */

process.loadEnvFile?.() || require('dotenv').config();

const axios = require('axios');
const { setupDatabase } = require('../src/db/setup');
const { db } = require('../src/db');
const { ocrPdfBuffer, encerrarWorker } = require('../src/parsers/ocr');
const { resumirTextoLimpo } = require('../src/utils/text');
const { criarProgresso } = require('../src/utils/progress');
const config = require('../src/config');

const MIN_CHARS_OCR = 200;

function parseArgs(argv) {
  const o = { apply: false, limite: null, maxPaginas: 15 };
  for (const a of argv) {
    if (a === '--apply') { o.apply = true; }
    else if (a.startsWith('--limite=')) { o.limite = Number(a.split('=')[1]); }
    else if (a.startsWith('--max-paginas=')) { o.maxPaginas = Number(a.split('=')[1]); }
  }
  return o;
}

function listar(limite) {
  const limitClause = Number.isFinite(limite) && limite > 0 ? `LIMIT ${Math.floor(limite)}` : '';
  return db
    .prepare(
      `SELECT id, tipo, ano, url_pdf FROM documentos
        WHERE status_coleta = 'imagem'
          AND url_pdf IS NOT NULL AND url_pdf != ''
        ORDER BY ano DESC, id ${limitClause}`
    )
    .all();
}

async function baixar(url) {
  const r = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: config.collectorTimeoutMs * 3,
    headers: { 'user-agent': config.collectorUserAgent, accept: '*/*' },
  });
  return Buffer.from(r.data);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  setupDatabase();

  const docs = listar(opts.limite);
  console.warn(`Editais PDF-imagem a processar: ${docs.length}${opts.apply ? '' : ' (dry-run)'}`);
  if (!opts.apply) {
    return;
  }

  const update = db.prepare(
    `UPDATE documentos
        SET texto_completo = @texto,
            resumo = @resumo,
            status_coleta = 'ok',
            dados_extras = json_set(IFNULL(dados_extras, '{}'), '$.texto_origem', 'ocr'),
            atualizado_em = CURRENT_TIMESTAMP
      WHERE id = @id`
  );
  // Coluna resumo = truncagem limpa do texto (fallback de exibição). Regenerar
  // junto com o texto evita resumo antigo/lixo preso quando o OCR melhora; a
  // versão "limpa" pula o ruído de cabeçalho do OCR.
  const resumirTexto = resumirTextoLimpo;

  const prog = criarProgresso('ocr-documentos-imagem', { total: docs.length });
  const cont = { ok: 0, ilegivel: 0, erro: 0 };
  for (let i = 0; i < docs.length; i += 1) {
    const d = docs[i];
    const tag = `[${i + 1}/${docs.length}] #${d.id} (${d.tipo} / ${d.ano})`;
    let categoria = 'ok';
    let info = `#${d.id}`;
    try {
      const buf = await baixar(d.url_pdf);
      const r = await ocrPdfBuffer(buf, { maxPaginas: opts.maxPaginas });
      const texto = (r.texto || '').trim();
      if (texto.length >= MIN_CHARS_OCR) {
        update.run({ id: d.id, texto, resumo: resumirTexto(texto) });
        cont.ok += 1;
        info = `#${d.id} OK ${r.paginas}p`;
        console.warn(`${tag} OK — ${r.paginas}p, ${texto.length} chars`);
      } else {
        cont.ilegivel += 1;
        categoria = 'ilegivel';
        info = `#${d.id} ilegível (${texto.length})`;
        console.warn(`${tag} ILEGÍVEL — ${texto.length} chars`);
      }
    } catch (err) {
      cont.erro += 1;
      categoria = 'erro';
      info = `#${d.id} ERRO: ${err.message.slice(0, 60)}`;
      console.error(`${tag} ERRO: ${err.message}`);
    }
    prog.tick(info, categoria);
  }

  await encerrarWorker();
  const resumo = `texto OCR ok: ${cont.ok} · ilegíveis: ${cont.ilegivel} · erros: ${cont.erro}`;
  prog.finish(resumo);
  console.warn(`\nAplicado — ${resumo}`);
  console.warn('Próximo: resumo IA (scheduler/`npm run ai:resumir`) e análise (`ai:correlacionar:lote`).');
}

main().catch(async (e) => {
  await encerrarWorker().catch(() => { });
  console.error(`Falha: ${e.message}`);
  process.exitCode = 1;
});
