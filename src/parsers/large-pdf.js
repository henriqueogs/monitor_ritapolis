'use strict';
const { normalizeText } = require('../utils/text');
const { isImageBasedPdf } = require('./pdf');
const { runPdfCommand } = require('./pdf-native-command');
const MAX_PAGES = 1000;
const MAX_TEXT_CHARS = 2000000;
const VERSION = 'disk-pdf-v1';
// A whole-text gate lets one run of table borders reject a 150-page scan.
// Judge pages individually; a few weak pages are recorded, many block.
const MAX_WEAK_PAGES_RATIO = 0.1;
async function extractLargePdfFile(
  file,
  { fileHash, progress, run = runPdfCommand, ocrPage } = {}
) {
  if (!/^[a-f0-9]{64}$/.test(String(fileHash))) {throw new Error('PDF: hash de arquivo invalido');}
  const base = `${VERSION}:${fileHash}`;
  let info = progress?.load(`${base}:info`);
  if (!info) {
    const metadata = await run('pdfinfo', [file], { progress, maxBuffer: 128000 });
    const pages = Number(metadata.match(/^Pages:\s+(\d+)\s*$/m)?.[1]);
    if (!Number.isSafeInteger(pages) || pages < 1 || pages > MAX_PAGES)
      {throw new Error(`PDF: paginas fora do limite seguro de ${MAX_PAGES}`);}
    info = { pages };
    progress?.save(`${base}:info`, info);
  }
  if (!Number.isSafeInteger(info.pages) || info.pages < 1 || info.pages > MAX_PAGES)
    {throw new Error('PDF: checkpoint de paginas invalido');}
  const texts = [];
  const weakPages = [];
  let chars = 0,
    ocrPages = 0;
  for (let page = 1; page <= info.pages; page++) {
    const key = `${base}:page:${page}`;
    let saved = progress?.load(key);
    if (!saved) {
      let text = normalizeText(
        await run('pdftotext', ['-layout', '-f', String(page), '-l', String(page), file, '-'], {
          progress,
        })
      );
      let ocr = false;
      if (isImageBasedPdf(text, 1)) {
        if (!ocrPage) {throw new Error(`PDF: pagina ${page} exige OCR; cobertura incompleta`);}
        progress?.checkTime();
        text = await ocrPage(file, page, { progress });
        ocr = true;
      }
      saved = { text, ocr };
      progress?.save(key, saved);
    }
    if (typeof saved.text !== 'string') {throw new Error('PDF: checkpoint de texto invalido');}
    chars += saved.text.length + 2;
    if (chars > MAX_TEXT_CHARS)
      {throw new Error(`PDF: texto excede limite de ${MAX_TEXT_CHARS} caracteres`);}
    texts.push(saved.text);
    if (isImageBasedPdf(saved.text, 1)) {weakPages.push(page);}
    ocrPages += Number(saved.ocr);
  }
  const text = normalizeText(texts.join('\n\n'));
  if (weakPages.length / info.pages > MAX_WEAK_PAGES_RATIO)
    {throw new Error('PDF: texto insuficiente apos OCR; exige revisao');}
  return {
    text,
    pages: info.pages,
    info: {
      parser: VERSION,
      ocr_pages: ocrPages,
      cobertura: {
        file_hash: fileHash,
        pages: info.pages,
        processed_pages: info.pages,
        complete: true,
        paginas_baixa_qualidade: weakPages,
      },
    },
  };
}
module.exports = { extractLargePdfFile, VERSION, MAX_PAGES, MAX_TEXT_CHARS };
