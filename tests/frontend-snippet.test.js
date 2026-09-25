'use strict';

const fs = require('fs');
const path = require('path');
const { partesDoSnippet } = require('../frontend/lib/snippet');

describe('partesDoSnippet', () => {
  it('separa trechos destacados por <mark> dos trechos normais', () => {
    // Arrange
    const snippet = '…contrato de <mark>diárias</mark> para <mark>viagem</mark> a serviço…';

    // Act
    const partes = partesDoSnippet(snippet);

    // Assert
    expect(partes).toEqual([
      { texto: '…contrato de ', destaque: false },
      { texto: 'diárias', destaque: true },
      { texto: ' para ', destaque: false },
      { texto: 'viagem', destaque: true },
      { texto: ' a serviço…', destaque: false },
    ]);
  });

  it('mantém HTML vindo do documento como texto (não vira elemento)', () => {
    const snippet = '<img src=x onerror=alert(1)> <mark>edital</mark> <a href="//mal">clique</a>';

    const partes = partesDoSnippet(snippet);

    expect(partes).toEqual([
      { texto: '<img src=x onerror=alert(1)> ', destaque: false },
      { texto: 'edital', destaque: true },
      { texto: ' <a href="//mal">clique</a>', destaque: false },
    ]);
  });

  it('retorna lista vazia para snippet ausente e ignora trechos vazios', () => {
    expect(partesDoSnippet(null)).toEqual([]);
    expect(partesDoSnippet('<mark>x</mark>')).toEqual([{ texto: 'x', destaque: true }]);
  });

  it('DocumentRow não usa dangerouslySetInnerHTML', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../frontend/app/components/DocumentRow.js'),
      'utf8'
    );
    expect(src).not.toContain('dangerouslySetInnerHTML');
  });
});
