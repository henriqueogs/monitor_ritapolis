const JSZip = require('jszip');
const { extractOfficialFileText, inferFileExtension } = require('./document-file');

async function buildXlsxFixture() {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
      <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
    </Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
    </Relationships>`);
  zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8"?>
    <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
      <sheets><sheet name="Itens" sheetId="1" r:id="rId1"/></sheets>
    </workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
    </Relationships>`);
  zip.file('xl/worksheets/sheet1.xml', `<?xml version="1.0" encoding="UTF-8"?>
    <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
      <row r="1"><c r="A1" t="inlineStr"><is><t>Item</t></is></c><c r="B1" t="inlineStr"><is><t>Descricao</t></is></c><c r="C1" t="inlineStr"><is><t>Unidade</t></is></c><c r="D1" t="inlineStr"><is><t>Quantidade</t></is></c><c r="E1" t="inlineStr"><is><t>Valor Unitario</t></is></c><c r="F1" t="inlineStr"><is><t>Valor Total</t></is></c></row>
      <row r="2"><c r="A2"><v>1</v></c><c r="B2" t="inlineStr"><is><t>Cadeira escolar</t></is></c><c r="C2" t="inlineStr"><is><t>UN</t></is></c><c r="D2"><v>10</v></c><c r="E2"><v>25.5</v></c><c r="F2"><v>255</v></c></row>
    </sheetData></worksheet>`);
  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('document-file spreadsheet extraction', () => {
  test('detects spreadsheet extensions', () => {
    expect(inferFileExtension({ filename: 'orcamento.xlsx' })).toBe('xlsx');
    expect(inferFileExtension({ filename: 'PLANILHA.xls' })).toBe('xls');
  });

  test('extracts spreadsheet rows as pipe-separated text', async () => {
    const buffer = await buildXlsxFixture();

    const result = await extractOfficialFileText(buffer, { filename: 'itens.xlsx' });

    expect(result.error).toBeNull();
    expect(result.info.parser).toBe('xlsx');
    expect(result.text).toContain('[PLANILHA xlsx]');
    expect(result.text).toContain('[ABA] Itens');
    expect(result.text).toContain('LINHA 1 | Item | Descricao | Unidade | Quantidade');
    expect(result.text).toContain('LINHA 2 | 1 | Cadeira escolar | UN | 10');
  });

  test('quarantines legacy spreadsheet formats', async () => {
    const result = await extractOfficialFileText(Buffer.from('legacy'), { filename: 'itens.xls' });

    expect(result.info.status_sugerido).toBe('quarentena_formato_legado');
    expect(result.info.unsupported).toBe(true);
  });
});
