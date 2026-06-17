const pdfParse = require('pdf-parse');
const { normalizeText, isPalavraReal } = require('../utils/text');

// Símbolos que NÃO ocorrem em texto legível em sequência longa — uma corrida de
// 6+ deles (excluída a pontuação básica) denuncia lixo de encoding/OCR.
const RE_CORRIDA_LIXO = /[^a-z0-9áéíóúàèìòùâêîôûãõçñ\s.,;:!?()/-]{6,}/i;
const MIN_CHARS_POR_PAGINA = 15;
const PROPORCAO_PALAVRAS_MIN = 0.3;
const LIMITE_TEXTO_LONGO = 100;

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
    console.warn = () => { };
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
    console.warn = () => { };
    console.log = () => { };
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

/**
 * Detecta se o texto extraído de um PDF é "lixo" (OCR ruim / encoding incorreto)
 * ou ausente (scan sem camada de texto), indicando que o PDF precisa de OCR.
 *
 * O sinal central é a QUALIDADE DE PALAVRAS (`isPalavraReal`): texto legível é
 * dominado por palavras reais; lixo de OCR é dominado por letras soltas e
 * símbolos. Critérios (OR — qualquer um dispara):
 *   1. Nenhuma palavra real no texto inteiro (ex.: "a,r t B B !4tS", "aaaa...").
 *   2. Página quase vazia (densidade < 15 chars/página).
 *   3. Corrida longa de símbolos especiais variados (lixo de encoding).
 *   4. Texto longo (> 100 chars) dominado por não-palavras (< 30% palavras reais).
 */
function isImageBasedPdf(text, numPages) {
  if (!text || text.trim().length === 0) {
    return true;
  }

  const trimmedText = text.trim();
  const pages = Number(numPages) > 0 ? Number(numPages) : 1;
  const tokens = trimmedText.split(/\s+/).filter(Boolean);
  const palavrasReais = tokens.filter(isPalavraReal).length;

  if (palavrasReais === 0) {
    return true;
  }
  if (trimmedText.length / pages < MIN_CHARS_POR_PAGINA) {
    return true;
  }
  if (RE_CORRIDA_LIXO.test(trimmedText)) {
    return true;
  }
  if (trimmedText.length > LIMITE_TEXTO_LONGO) {
    const proporcao = palavrasReais / tokens.length;
    if (proporcao < PROPORCAO_PALAVRAS_MIN) {
      return true;
    }
  }

  return false;
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
  extractPdfText,
  isImageBasedPdf
};
