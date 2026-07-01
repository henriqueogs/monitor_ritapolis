const XLSX = require('xlsx');
const { extractOfficialFileText, inferFileExtension } = require('./document-file');

describe('document-file spreadsheet extraction', () => {
  test('detects spreadsheet extensions', () => {
    expect(inferFileExtension({ filename: 'orcamento.xlsx' })).toBe('xlsx');
    expect(inferFileExtension({ filename: 'PLANILHA.xls' })).toBe('xls');
  });

  test('extracts spreadsheet rows as pipe-separated text', async () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ['Item', 'Descricao', 'Unidade', 'Quantidade', 'Valor Unitario', 'Valor Total'],
      [1, 'Cadeira escolar', 'UN', 10, 25.5, 255]
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, 'Itens');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    const result = await extractOfficialFileText(buffer, { filename: 'itens.xlsx' });

    expect(result.error).toBeNull();
    expect(result.info.parser).toBe('xlsx');
    expect(result.text).toContain('[PLANILHA xlsx]');
    expect(result.text).toContain('[ABA] Itens');
    expect(result.text).toContain('LINHA 1 | Item | Descricao | Unidade | Quantidade');
    expect(result.text).toContain('LINHA 2 | 1 | Cadeira escolar | UN | 10');
  });
});
