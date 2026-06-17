'use strict';

// Regras de não-regressão ao re-salvar um documento já existente. Evita que uma
// re-coleta (que extrai por pdfjs) atropele dados melhores já gravados:
//   - texto de OCR é autoritativo: a re-coleta por pdfjs não o sobrescreve
//     (o PDF-imagem foi OCR de propósito justamente porque a camada de texto era
//     ruim; só o re-OCR explícito deve atualizá-lo);
//   - `ano` já preenchido não pode ser apagado por uma coleta que veio sem ano.

function parseDados(dadosExtras) {
  if (!dadosExtras) {
    return null;
  }
  if (typeof dadosExtras === 'object') {
    return dadosExtras;
  }
  try {
    return JSON.parse(dadosExtras);
  } catch {
    return null;
  }
}

// O texto existente veio de OCR? (marca de procedência gravada pelos scripts de OCR)
function isOrigemOcr(dadosExtras) {
  const d = parseDados(dadosExtras);
  return Boolean(d && (d.texto_origem === 'ocr' || d.ocr_dpi));
}

// Deve PRESERVAR o texto existente (OCR) em vez de sobrescrever na re-coleta?
// Verdadeiro quando o existente veio de OCR e tem conteúdo — o OCR é autoritativo
// e a coleta por pdfjs não deve rebaixá-lo (a camada de texto do PDF-imagem é
// pior; foi por isso que rodamos OCR). A atualização do texto OCR é feita só pelo
// re-OCR explícito (scripts/reocr-documentos.js).
function devePreservarTextoOcr({ existenteDadosExtras, existenteTexto } = {}) {
  if (!existenteTexto || !String(existenteTexto).trim()) {
    return false;
  }
  return isOrigemOcr(existenteDadosExtras);
}

module.exports = { isOrigemOcr, devePreservarTextoOcr };
