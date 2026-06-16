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

// Reconstrói o texto de uma página usando a geometria dos itens (x/y), em vez de
// juntar tudo com espaço. Junta glifos contíguos sem espaço (não quebra números
// como "1.800.000,00"), insere espaço só quando há lacuna real e quebra linha
// quando o item sinaliza fim de linha ou o y muda.
function reconstructPageText(items) {
  const parts = [];
  let prev = null;

  for (const item of items) {
    if (!('str' in item)) {
      continue;
    }
    const str = item.str || '';

    if (prev) {
      const fontSize = prev.height || item.height || 10;
      const dy = Math.abs((item.transform?.[5] ?? 0) - (prev.transform?.[5] ?? 0));
      const novaLinha = prev.hasEOL || dy > fontSize * 0.5;

      if (novaLinha) {
        parts.push('\n');
      } else {
        const prevFimX = (prev.transform?.[4] ?? 0) + (prev.width || 0);
        const gap = (item.transform?.[4] ?? 0) - prevFimX;
        // Espaço só com lacuna perceptível; senão concatena (mantém número inteiro)
        if (gap > fontSize * 0.3 && !/\s$/.test(parts[parts.length - 1] || '')) {
          parts.push(' ');
        }
      }
    }

    parts.push(str);
    prev = item;
  }

  return parts.join('');
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
      pages.push(reconstructPageText(content.items));
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
