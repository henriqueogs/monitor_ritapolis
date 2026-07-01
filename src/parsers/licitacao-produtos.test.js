const { parseProdutosLicitados } = require('./licitacao-produtos');

describe('licitacao-produtos spreadsheet text', () => {
  test('extracts products from generated spreadsheet text', () => {
    const text = [
      '[PLANILHA xlsx]',
      '[ABA] Itens',
      'LINHA 1 | Item | Descricao | Unidade | Quantidade | Valor Unitario | Valor Total',
      'LINHA 2 | 1 | Cadeira escolar | UN | 10 | 25,50 | 255,00',
      'LINHA 3 | 2 | Mesa para professor | UN | 3 | 120,00 | 360,00'
    ].join('\n');

    const produtos = parseProdutosLicitados(text);

    expect(produtos).toHaveLength(2);
    expect(produtos[0]).toMatchObject({
      item_numero: '1',
      descricao: 'Cadeira escolar',
      unidade: 'UN',
      quantidade: 10,
      valor_unitario_estimado: 25.5,
      valor_total_estimado: 255,
      origem: 'planilha'
    });
    expect(produtos[1].valor_total_estimado).toBe(360);
  });
});
