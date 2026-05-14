const pdfParse = require('pdf-parse');
const { normalizeText } = require('../utils/text');

let pdfjsModulePromise;

function normalizeWhitespace(text) {
  return normalizeText(text).replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').trim();
}

function getPdfjs() {
  if (!pdfjsModulePromise) {
    pdfjsModulePromise = import('pdfjs-dist/legacy/build/pdf.mjs');
  }

  return pdfjsModulePromise;
}

async function extractWithPdfjs(buffer) {
  const pdfjs = await getPdfjs();
  const originalWarn = console.warn;

  try {
    console.warn = () => {};
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      isEvalSupported: false,
      useWorkerFetch: false
    });
    const document = await loadingTask.promise;
    const pages = [];

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ');
      pages.push(text);
    }

    return {
      text: normalizeWhitespace(pages.join('\n\n')),
      pages: document.numPages || 0,
      info: {
        parser: 'pdfjs-dist'
      }
    };
  } finally {
    console.warn = originalWarn;
  }
}

async function extractWithPdfParse(buffer) {
  const originalWarn = console.warn;
  const originalLog = console.log;

  try {
    console.warn = () => {};
    console.log = () => {};
    const result = await pdfParse(buffer);
    return {
      text: normalizeWhitespace(result.text || ''),
      pages: result.numpages || 0,
      info: {
        ...(result.info || {}),
        parser: 'pdf-parse'
      }
    };
  } finally {
    console.warn = originalWarn;
    console.log = originalLog;
  }
}

async function extractPdfText(buffer) {
  try {
    return await extractWithPdfjs(buffer);
  } catch (pdfjsError) {
    try {
      const fallback = await extractWithPdfParse(buffer);
      return {
        ...fallback,
        info: {
          ...(fallback.info || {}),
          fallback_reason: pdfjsError.message
        }
      };
    } catch (pdfParseError) {
      return {
        text: '',
        pages: 0,
        info: {},
        error: pdfjsError.message || pdfParseError.message
      };
    }
  }
}

module.exports = {
  extractPdfText
};
