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
 *   node scripts/ocr-anexos.js --apply --somente-classificar-nao-ocr
 *   node scripts/ocr-anexos.js --apply --ano=2026 --tipos=ata,homologacao,resultado
 */

process.loadEnvFile?.() || require('dotenv').config();

const crypto = require('crypto');
const axios = require('axios');
const { setupDatabase } = require('../src/db/setup');
const { db, saveDocumentoAnexoTexto } = require('../src/db');
const { ocrPdfBuffer, ocrImagemBuffer, encerrarWorker } = require('../src/parsers/ocr');
const { extractOfficialFileText, inferFileExtension } = require('../src/parsers/document-file');
const { criarProgresso } = require('../src/utils/progress');
const config = require('../src/config');

const MIN_CHARS_OCR = 80; // abaixo disso, o scan é ilegível — segue requer_ocr

function parseArgs(argv) {
  const o = {
    apply: false,
    limite: null,
    tipos: null,
    ano: null,
    documentoId: null,
    anexoIds: null,
    maxPaginas: 12,
    somenteClassificarNaoOcr: false,
  };
  for (const a of argv) {
    if (a === '--apply') {o.apply = true;}
    else if (a === '--somente-classificar-nao-ocr') {o.somenteClassificarNaoOcr = true;}
    else if (a.startsWith('--limite=')) {o.limite = Number(a.split('=')[1]);}
    else if (a.startsWith('--tipos=')) {o.tipos = a.split('=')[1].split(',').map((s) => s.trim());}
    else if (a.startsWith('--ano=')) {o.ano = Number(a.split('=')[1]);}
    else if (a.startsWith('--documento=')) {o.documentoId = Number(a.split('=')[1]);}
    else if (a.startsWith('--anexo=')) {
      o.anexoIds = a.split('=')[1].split(',').map((id) => Number(id.trim())).filter((id) => Number.isFinite(id) && id > 0);
    }
    else if (a.startsWith('--max-paginas=')) {o.maxPaginas = Number(a.split('=')[1]);}
  }
  return o;
}

function listarAnexos({ limite, tipos, ano, documentoId, anexoIds }) {
  const filtros = ["da.status_extracao = 'requer_ocr'"];
  const params = {};
  if (tipos && tipos.length) {
    filtros.push(`da.tipo IN (${tipos.map((_, i) => `@tipo${i}`).join(',')})`);
    tipos.forEach((tipo, i) => {
      params[`tipo${i}`] = tipo;
    });
  }
  if (Number.isFinite(ano) && ano > 0) {
    filtros.push('d.ano = @ano');
    params.ano = ano;
  }
  if (Number.isFinite(documentoId) && documentoId > 0) {
    filtros.push('da.documento_id = @documentoId');
    params.documentoId = documentoId;
  }
  if (anexoIds && anexoIds.length) {
    filtros.push(`da.id IN (${anexoIds.map((_, i) => `@anexo${i}`).join(',')})`);
    anexoIds.forEach((id, i) => {
      params[`anexo${i}`] = id;
    });
  }
  const limitClause = Number.isFinite(limite) && limite > 0 ? `LIMIT ${Math.floor(limite)}` : '';
  return db
    .prepare(
      `SELECT da.id, da.documento_id, da.nome, da.url, da.tipo
        FROM documentos_anexos da
        JOIN documentos d ON d.id = da.documento_id
        WHERE ${filtros.join(' AND ')}
        ORDER BY d.ano DESC, da.documento_id, da.id ${limitClause}`
    )
    .all(params);
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

function tipoArquivo(anexo) {
  return inferFileExtension({ filename: anexo.nome, url: anexo.url }) || 'pdf';
}

function ehOcravel(extension) {
  return ['pdf', 'jpg', 'jpeg', 'png', 'tif', 'tiff', 'bmp'].includes(extension);
}

function ehTextoSimples(extension) {
  return ['txt', 'csv', 'xml', 'rtf', 'log'].includes(extension);
}

function parecePdf(buffer) {
  return Buffer.isBuffer(buffer) && buffer.subarray(0, 8).toString('latin1').includes('%PDF');
}

function mensagemArquivoIndisponivel(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    return null;
  }

  const trecho = buffer.subarray(0, 1000).toString('latin1').replace(/\s+/g, ' ').trim();
  if (/arquivo\s+\d+.*n[aã]o\s+encontrado/i.test(trecho)) {
    return trecho;
  }
  if (/<!doctype html|<html|<body/i.test(trecho)) {
    return 'fonte retornou HTML no lugar do arquivo esperado';
  }
  return null;
}

function statusNaoOcravel(extension) {
  if (ehOcravel(extension)) {
    return null;
  }

  if (ehTextoSimples(extension)) {
    return null;
  }

  if (['xls', 'xlsx', 'ods'].includes(extension)) {
    return {
      status: 'pendente_parser_planilha',
      erro: `arquivo ${extension} exige parser de planilha para extracao estruturada`,
    };
  }

  return {
    status: 'ignorado_sem_texto_util',
    erro: `arquivo ${extension} nao e OCRavel`,
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  setupDatabase();

  const anexos = listarAnexos(opts);
  console.warn(`Anexos requer_ocr a processar: ${anexos.length}${opts.apply ? '' : ' (dry-run — use --apply)'}`);
  if (!opts.apply) {
    anexos.slice(0, 15).forEach((a) => console.warn(`  #${a.id} [${a.tipo}] ${a.nome}`));
    return;
  }

  const prog = criarProgresso('ocr-anexos', { total: anexos.length });
  const cont = { ok: 0, ilegivel: 0, erro: 0, chars: 0 };
  for (let i = 0; i < anexos.length; i += 1) {
    const a = anexos[i];
    const tag = `[${i + 1}/${anexos.length}] #${a.id}`;
    let categoria = 'ok';
    let info = `#${a.id}`;
    try {
      const extension = tipoArquivo(a);
      const naoOcravel = statusNaoOcravel(extension);
      if (naoOcravel) {
        saveDocumentoAnexoTexto({
          id: a.id,
          texto: null,
          status: naoOcravel.status,
          erro: naoOcravel.erro,
          parser: 'ocr_skip_unsupported',
          paginas: null,
        });
        cont.ilegivel += 1;
        categoria = 'ignorado';
        info = `#${a.id} ${naoOcravel.status}`;
        console.warn(`${tag} IGNORADO — ${naoOcravel.erro} (${a.nome})`);
        prog.tick(info, categoria);
        continue;
      }

      if (opts.somenteClassificarNaoOcr && !ehTextoSimples(extension)) {
        cont.ilegivel += 1;
        categoria = 'ignorado';
        info = `#${a.id} OCRavel`;
        console.warn(`${tag} PULADO — arquivo OCRavel (${extension})`);
        prog.tick(info, categoria);
        continue;
      }

      const buf = await baixar(a.url);
      if (extension === 'pdf' && !parecePdf(buf)) {
        const msg = mensagemArquivoIndisponivel(buf) || 'arquivo baixado nao tem assinatura PDF';
        saveDocumentoAnexoTexto({
          id: a.id,
          texto: null,
          status: 'erro_download',
          erro: msg,
          parser: 'ocr_preflight',
          paginas: null,
        });
        cont.erro += 1;
        categoria = 'erro';
        info = `#${a.id} arquivo indisponível`;
        console.warn(`${tag} ERRO_DOWNLOAD — ${msg} (${a.nome})`);
        prog.tick(info, categoria);
        continue;
      }

      const r = ehOcravel(extension)
        ? ehImagem(a.nome)
          ? await ocrImagemBuffer(buf)
          : await ocrPdfBuffer(buf, { maxPaginas: opts.maxPaginas })
        : await extractOfficialFileText(buf, { filename: a.nome, url: a.url });
      const texto = (r.texto || r.text || '').trim();

      if (texto.length >= MIN_CHARS_OCR) {
        saveDocumentoAnexoTexto({
          id: a.id,
          texto,
          textoHash: crypto.createHash('sha256').update(texto).digest('hex'),
          status: 'ok',
          erro: null,
          parser: r.info?.parser || 'ocr_tesseract',
          paginas: r.paginas ?? r.pages,
        });
        cont.ok += 1;
        cont.chars += texto.length;
        info = `#${a.id} OK ${r.paginas ?? r.pages ?? 0}p`;
        console.warn(`${tag} OK — ${r.paginas ?? r.pages ?? 0}p, ${texto.length} chars (${a.tipo})`);
      } else {
        saveDocumentoAnexoTexto({
          id: a.id,
          texto: null,
          status: 'ocr_sem_texto_legivel',
          erro: `OCR executado, mas retornou apenas ${texto.length} chars`,
          parser: r.info?.parser || 'ocr_tesseract',
          paginas: r.paginas ?? r.pages,
        });
        cont.ilegivel += 1;
        categoria = 'ilegivel';
        info = `#${a.id} ilegível (${texto.length})`;
        console.warn(`${tag} ILEGÍVEL — ${texto.length} chars, marcado como ocr_sem_texto_legivel`);
      }
    } catch (err) {
      saveDocumentoAnexoTexto({
        id: a.id,
        texto: null,
        status: 'erro_ocr',
        erro: err.message,
        parser: 'ocr_tesseract',
        paginas: null,
      });
      cont.erro += 1;
      categoria = 'erro';
      info = `#${a.id} ERRO: ${err.message.slice(0, 60)}`;
      console.error(`${tag} ERRO: ${err.message}`);
    }
    prog.tick(info, categoria);
  }

  await encerrarWorker();
  const resumo = `OCR ok: ${cont.ok} · ilegíveis: ${cont.ilegivel} · erros: ${cont.erro} · ${cont.chars} chars extraídos`;
  prog.finish(resumo);
  console.warn(`\nAplicado — ${resumo}`);
}

main().catch(async (e) => {
  await encerrarWorker().catch(() => {});
  console.error(`Falha: ${e.message}`);
  process.exitCode = 1;
});
