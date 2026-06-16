'use strict';

/**
 * OCR local (sem IA) dos anexos marcados como `requer_ocr` — PDFs/imagens
 * escaneados de onde o parser de texto não extraiu nada. Usa pdftoppm + tesseract
 * (ver src/parsers/ocr.js). Preenche `documentos_anexos.texto_completo`:
 *   - texto reconhecido → status 'ok'
 *   - ainda vazio (scan ilegível) → mantém 'requer_ocr'
 *
 * Depois, o vencedor/valor/produtos saem do texto via os scripts de extração já
 * existentes (licitacoes:derivar-vencedores, etc.).
 *
 * Reentrante e chunkável (só processa 'requer_ocr'). Rode em foreground por
 * chunks para evitar que o processo em background seja encerrado pelo ambiente.
 *
 * Uso:
 *   node scripts/ocr-anexos.js                      # dry-run (lista)
 *   node scripts/ocr-anexos.js --apply --limite=40
 *   node scripts/ocr-anexos.js --apply --tipos=ata,homologacao,resultado
 */

process.loadEnvFile?.() || require('dotenv').config();

const crypto = require('crypto');
const axios = require('axios');
const { setupDatabase } = require('../src/db/setup');
const { db, saveDocumentoAnexoTexto } = require('../src/db');
const { ocrPdfBuffer, ocrImagemBuffer, encerrarWorker } = require('../src/parsers/ocr');
const config = require('../src/config');

const MIN_CHARS_OCR = 80; // abaixo disso, o scan é ilegível — segue requer_ocr

function parseArgs(argv) {
  const o = { apply: false, limite: null, tipos: null, maxPaginas: 12 };
  for (const a of argv) {
    if (a === '--apply') {o.apply = true;}
    else if (a.startsWith('--limite=')) {o.limite = Number(a.split('=')[1]);}
    else if (a.startsWith('--tipos=')) {o.tipos = a.split('=')[1].split(',').map((s) => s.trim());}
    else if (a.startsWith('--max-paginas=')) {o.maxPaginas = Number(a.split('=')[1]);}
  }
  return o;
}

function listarAnexos({ limite, tipos }) {
  const filtros = ["status_extracao = 'requer_ocr'"];
  if (tipos && tipos.length) {
    filtros.push(`tipo IN (${tipos.map((t) => `'${t}'`).join(',')})`);
  }
  const limitClause = Number.isFinite(limite) && limite > 0 ? `LIMIT ${Math.floor(limite)}` : '';
  return db
    .prepare(
      `SELECT id, documento_id, nome, url, tipo FROM documentos_anexos
        WHERE ${filtros.join(' AND ')}
        ORDER BY documento_id, id ${limitClause}`
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

const ehImagem = (nome) => /\.(jpe?g|png|tiff?|bmp)$/i.test(nome || '');

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  setupDatabase();

  const anexos = listarAnexos(opts);
  console.warn(`Anexos requer_ocr a processar: ${anexos.length}${opts.apply ? '' : ' (dry-run — use --apply)'}`);
  if (!opts.apply) {
    anexos.slice(0, 15).forEach((a) => console.warn(`  #${a.id} [${a.tipo}] ${a.nome}`));
    return;
  }

  const cont = { ok: 0, ilegivel: 0, erro: 0, chars: 0 };
  for (let i = 0; i < anexos.length; i += 1) {
    const a = anexos[i];
    const tag = `[${i + 1}/${anexos.length}] #${a.id}`;
    try {
      const buf = await baixar(a.url);
      const r = ehImagem(a.nome)
        ? await ocrImagemBuffer(buf)
        : await ocrPdfBuffer(buf, { maxPaginas: opts.maxPaginas });
      const texto = (r.texto || '').trim();

      if (texto.length >= MIN_CHARS_OCR) {
        saveDocumentoAnexoTexto({
          id: a.id,
          texto,
          textoHash: crypto.createHash('sha256').update(texto).digest('hex'),
          status: 'ok',
          erro: null,
          parser: 'ocr_tesseract',
          paginas: r.paginas,
        });
        cont.ok += 1;
        cont.chars += texto.length;
        console.warn(`${tag} OK — ${r.paginas}p, ${texto.length} chars (${a.tipo})`);
      } else {
        cont.ilegivel += 1;
        console.warn(`${tag} ILEGÍVEL — ${texto.length} chars, segue requer_ocr`);
      }
    } catch (err) {
      cont.erro += 1;
      console.error(`${tag} ERRO: ${err.message}`);
    }
  }

  await encerrarWorker();
  console.warn(
    `\nAplicado — OCR ok: ${cont.ok} · ilegíveis: ${cont.ilegivel} · erros: ${cont.erro} · ${cont.chars} chars extraídos`
  );
}

main().catch(async (e) => {
  await encerrarWorker().catch(() => {});
  console.error(`Falha: ${e.message}`);
  process.exitCode = 1;
});
