'use strict';

/**
 * Re-OCR de documentos com o pipeline atual (300 DPI + modelos "best"), para
 * corrigir trocas de caractere de OCRs antigos em baixa resolução
 * ("PERMANÊNCTA" → "PERMANÊNCIA", "0U202s" → "01/2025"). Baixa o PDF de novo,
 * roda o OCR melhorado, limpa o ruído e regenera `resumo`.
 *
 * SEGURANÇA: nunca substitui texto bom por vazio/curto — só grava quando o novo
 * OCR rende texto substancial. Marca dados_extras.texto_origem='ocr' e
 * registra dados_extras.ocr_dpi para rastreabilidade.
 *
 * Seleção de alvos (um é obrigatório):
 *   --documento-id=648            # um documento específico (qualquer status)
 *   --status=imagem               # todos os scans ainda marcados como imagem
 *   --reocr-baixo-dpi             # docs já OCR cujo ocr_dpi < 300 (ou ausente)
 *
 * Dry-run por padrão. Uso:
 *   node scripts/reocr-documentos.js --documento-id=648
 *   node scripts/reocr-documentos.js --documento-id=648 --apply
 *   node scripts/reocr-documentos.js --status=imagem --limite=10 --apply
 */

process.loadEnvFile?.() || require('dotenv').config();

const axios = require('axios');
const { setupDatabase } = require('../src/db/setup');
const { db } = require('../src/db');
const { ocrPdfBuffer, encerrarWorker } = require('../src/parsers/ocr');
const { extractPdfText, isImageBasedPdf } = require('../src/parsers/pdf');
const { resumirTextoLimpo } = require('../src/utils/text');
const config = require('../src/config');

const MIN_CHARS_OCR = 120;
const DPI_ATUAL = 300;

function parseArgs(argv) {
  const o = {
    apply: false,
    documentoId: null,
    status: null,
    reocrBaixoDpi: false,
    detectarImagem: false,
    limite: null,
    maxPaginas: 15,
  };
  for (const a of argv) {
    if (a === '--apply') {
      o.apply = true;
    } else if (a === '--reocr-baixo-dpi') {
      o.reocrBaixoDpi = true;
    } else if (a === '--detectar-imagem') {
      o.detectarImagem = true;
    } else if (a.startsWith('--documento-id=')) {
      o.documentoId = Number(a.split('=')[1]);
    } else if (a.startsWith('--status=')) {
      o.status = a.split('=')[1];
    } else if (a.startsWith('--limite=')) {
      o.limite = Number(a.split('=')[1]);
    } else if (a.startsWith('--max-paginas=')) {
      o.maxPaginas = Number(a.split('=')[1]);
    }
  }
  return o;
}

function listar(opts) {
  const limitClause = Number.isFinite(opts.limite) && opts.limite > 0 ? `LIMIT ${Math.floor(opts.limite)}` : '';
  if (opts.documentoId) {
    return db
      .prepare('SELECT id, tipo, ano, url_pdf FROM documentos WHERE id = ?')
      .all(opts.documentoId);
  }
  if (opts.status) {
    return db
      .prepare(
        `SELECT id, tipo, ano, url_pdf FROM documentos
          WHERE status_coleta = ? AND url_pdf IS NOT NULL AND url_pdf != ''
          ORDER BY ano DESC, id ${limitClause}`
      )
      .all(opts.status);
  }
  if (opts.reocrBaixoDpi) {
    return db
      .prepare(
        `SELECT id, tipo, ano, url_pdf FROM documentos
          WHERE json_extract(dados_extras, '$.texto_origem') = 'ocr'
            AND url_pdf IS NOT NULL AND url_pdf != ''
            AND IFNULL(json_extract(dados_extras, '$.ocr_dpi'), 0) < ${DPI_ATUAL}
          ORDER BY ano DESC, id ${limitClause}`
      )
      .all();
  }
  if (opts.detectarImagem) {
    // Ainda não checados: nem re-OCR a 300 DPI nem marcados como texto-nativo.
    return db
      .prepare(
        `SELECT id, tipo, ano, url_pdf FROM documentos
          WHERE status_coleta = 'ok'
            AND url_pdf LIKE 'http%'
            AND IFNULL(json_extract(dados_extras, '$.ocr_dpi'), 0) < ${DPI_ATUAL}
            AND json_extract(dados_extras, '$.ocr_checado') IS NULL
          ORDER BY id ${limitClause}`
      )
      .all();
  }
  return [];
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
  if (!opts.documentoId && !opts.status && !opts.reocrBaixoDpi && !opts.detectarImagem) {
    console.error(
      'Selecione alvos: --documento-id=N | --status=imagem | --reocr-baixo-dpi | --detectar-imagem'
    );
    process.exitCode = 1;
    return;
  }

  setupDatabase();
  const docs = listar(opts);
  console.warn(`Documentos a avaliar: ${docs.length}${opts.apply ? '' : ' (dry-run)'}`);

  const update = db.prepare(
    `UPDATE documentos
        SET texto_completo = @texto,
            resumo = @resumo,
            status_coleta = 'ok',
            dados_extras = json_set(
              json_set(IFNULL(dados_extras, '{}'), '$.texto_origem', 'ocr'),
              '$.ocr_dpi', ${DPI_ATUAL}
            ),
            atualizado_em = CURRENT_TIMESTAMP
      WHERE id = @id`
  );
  // Marca um PDF de texto-nativo como já checado, para a varredura ser
  // reentrante e não rebaixá-lo de novo nas próximas execuções.
  const marcarChecado = db.prepare(
    `UPDATE documentos
        SET dados_extras = json_set(IFNULL(dados_extras, '{}'), '$.ocr_checado', 1)
      WHERE id = ?`
  );

  const cont = { ok: 0, curto: 0, erro: 0, sem_url: 0, texto_nativo: 0 };
  for (let i = 0; i < docs.length; i += 1) {
    const d = docs[i];
    const tag = `[${i + 1}/${docs.length}] #${d.id} (${d.tipo} / ${d.ano})`;
    const url = (d.url_pdf || '').startsWith('http') ? d.url_pdf : null;
    if (!url) {
      cont.sem_url += 1;
      console.warn(`${tag} sem url_pdf viva (pula)`);
      continue;
    }
    try {
      const buf = await baixar(url);

      // No modo detecção, só re-OCR PDFs sem camada de texto (imagem). PDFs de
      // texto extraem melhor pelo pdfjs — re-OCR só pioraria.
      if (opts.detectarImagem) {
        const extr = await extractPdfText(buf);
        if (!isImageBasedPdf(extr.text, extr.pages)) {
          cont.texto_nativo += 1;
          if (opts.apply) {
            marcarChecado.run(d.id);
          }
          continue;
        }
        console.warn(`${tag} PDF-imagem detectado — re-OCR…`);
      }

      const r = await ocrPdfBuffer(buf, { maxPaginas: opts.maxPaginas });
      const texto = (r.texto || '').trim();
      if (texto.length < MIN_CHARS_OCR) {
        cont.curto += 1;
        console.warn(`${tag} texto curto/ilegível (${texto.length} chars) — mantém`);
        continue;
      }
      console.warn(`${tag} OK — ${r.paginas}p, ${texto.length} chars`);
      if (opts.apply) {
        update.run({ id: d.id, texto, resumo: resumirTextoLimpo(texto) });
      }
      cont.ok += 1;
    } catch (err) {
      cont.erro += 1;
      console.error(`${tag} ERRO: ${err.message}`);
    }
  }

  await encerrarWorker();
  console.warn(
    `\n${opts.apply ? 'Aplicado' : 'Dry-run'} — re-OCR: ${cont.ok} · texto-nativo: ${cont.texto_nativo} · curtos: ${cont.curto} · erros: ${cont.erro} · sem url: ${cont.sem_url}`
  );
}

main().catch(async (e) => {
  await encerrarWorker().catch(() => {});
  console.error(`Falha: ${e.message}`);
  process.exitCode = 1;
});
