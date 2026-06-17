'use strict';

const { isOrigemOcr, devePreservarTextoOcr } = require('./documento-merge');

const TEXTO_OCR_BOM =
  'RESOLUÇÃO N. 01/2025 O Conselho Municipal dos Direitos da Criança e do Adolescente de Ritápolis resolve manter a conselheira tutelar suplente no cargo durante a atual gestão.';

describe('isOrigemOcr', () => {
  it('reconhece procedência OCR por texto_origem ou ocr_dpi', () => {
    expect(isOrigemOcr({ texto_origem: 'ocr' })).toBe(true);
    expect(isOrigemOcr({ ocr_dpi: 300 })).toBe(true);
    expect(isOrigemOcr(JSON.stringify({ texto_origem: 'ocr' }))).toBe(true);
  });

  it('falso para origem não-OCR ou ausente', () => {
    expect(isOrigemOcr({ parser_pdf: { engine: 'pdfjs-dist' } })).toBe(false);
    expect(isOrigemOcr(null)).toBe(false);
  });
});

describe('devePreservarTextoOcr', () => {
  it('preserva quando existente é OCR (lixo do pdfjs não rebaixa)', () => {
    expect(
      devePreservarTextoOcr({
        existenteDadosExtras: { texto_origem: 'ocr', ocr_dpi: 300 },
        existenteTexto: TEXTO_OCR_BOM,
      })
    ).toBe(true);
  });

  it('preserva mesmo quando o texto novo embedded parece legível (OCR é autoritativo)', () => {
    // A camada de texto do PDF-imagem pode ter palavras legíveis e ainda assim ser
    // pior que o OCR (cabeçalho mangled, "0U202s"). OCR manda.
    expect(
      devePreservarTextoOcr({
        existenteDadosExtras: { texto_origem: 'ocr' },
        existenteTexto: TEXTO_OCR_BOM,
      })
    ).toBe(true);
  });

  it('NÃO preserva quando o existente não veio de OCR', () => {
    expect(
      devePreservarTextoOcr({
        existenteDadosExtras: { parser_pdf: { engine: 'pdfjs-dist' } },
        existenteTexto: TEXTO_OCR_BOM,
      })
    ).toBe(false);
  });

  it('NÃO preserva quando não há texto existente', () => {
    expect(
      devePreservarTextoOcr({
        existenteDadosExtras: { texto_origem: 'ocr' },
        existenteTexto: '',
      })
    ).toBe(false);
  });
});
