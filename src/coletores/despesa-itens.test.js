'use strict';

const { parseItensDespesa } = require('./despesa-itens');

// Trecho real da página de detalhe (empenho 00542-000/2026): nota fiscal e itens.
const PAGINA = `
<TABLE class='ContasPublicas'>
<TR><TH colspan='3'>Nota Fiscal</TH></TR>
<TR><TD><b>Código:</b> 0001</TD><TD><b>Nota Fiscal:</b> 737</TD><TD><b>Série:</b> 0</TD></TR>
<TR><TD><b>Emissão:</b> 26/02/2026</TD><TD colspan='2'><b>Vencimento:</b> 26/03/2026</TR>
<TR><TH colspan='3'>Item 1</TH></TR>
<TR><TD colspan='3'><b>Produto:</b> 00000001283 - ENGRENAGEM</TD></TR>
<TR><TD colspan='3'><b>Complemento:</b> </TD></TR>
<TR><TD colspan='3'><b>Unidade:</b> PÇ</TD></TR>
<TR><TD colspan='3'><b>Marca:</b> </TD></TR>
<TR><TD><b>Quantidade:</b> 1,00</TD><TD><b>Valor Unitário:</b> 3.187,26</TD><TD><b>Total:</b> 3.187,26</TD></TR>
<TR><TH colspan='3'>Item 2</TH></TR>
<TR><TD colspan='3'><b>Produto:</b> 00000002196 - RETENTOR</TD></TR>
<TR><TD colspan='3'><b>Complemento:</b> VEDAÇÃO 40MM</TD></TR>
<TR><TD colspan='3'><b>Unidade:</b> PÇ</TD></TR>
<TR><TD colspan='3'><b>Marca:</b> SABO</TD></TR>
<TR><TD><b>Quantidade:</b> 2,00</TD><TD><b>Valor Unitário:</b> 1.082,86</TD><TD><b>Total:</b> 2.165,71</TD></TR>
</TABLE>`;

describe('parseItensDespesa', () => {
  const itens = parseItensDespesa(PAGINA);

  it('extrai cada item com produto, unidade, quantidade e preços numéricos', () => {
    expect(itens).toHaveLength(2);
    expect(itens[0]).toMatchObject({
      item: 1,
      nota_fiscal: '737',
      produto_codigo: '00000001283',
      produto: 'ENGRENAGEM',
      unidade: 'PÇ',
      quantidade: 1,
      valor_unitario: 3187.26,
      valor_total: 3187.26,
    });
  });

  it('campos vazios viram null e complemento/marca são lidos quando presentes', () => {
    expect(itens[0]).toMatchObject({ complemento: null, marca: null });
    expect(itens[1]).toMatchObject({ complemento: 'VEDAÇÃO 40MM', marca: 'SABO', quantidade: 2 });
  });

  it('página sem itens ou vazia devolve lista vazia', () => {
    expect(parseItensDespesa('<html>sem itens</html>')).toEqual([]);
    expect(parseItensDespesa(null)).toEqual([]);
  });

  it('acompanha a nota fiscal de cada bloco quando há mais de uma', () => {
    const duas = `${PAGINA}
<TR><TH colspan='3'>Nota Fiscal</TH></TR>
<TR><TD><b>Código:</b> 0001</TD><TD><b>Nota Fiscal:</b> 900</TD><TD><b>Série:</b> 1</TD></TR>
<TR><TH colspan='3'>Item 1</TH></TR>
<TR><TD colspan='3'><b>Produto:</b> 00000000005 - FILTRO</TD></TR>
<TR><TD colspan='3'><b>Unidade:</b> UN</TD></TR>
<TR><TD><b>Quantidade:</b> 3,00</TD><TD><b>Valor Unitário:</b> 10,50</TD><TD><b>Total:</b> 31,50</TD></TR>`;
    const r = parseItensDespesa(duas);
    expect(r).toHaveLength(3);
    expect(r[2]).toMatchObject({
      item: 1,
      nota_fiscal: '900',
      produto: 'FILTRO',
      valor_unitario: 10.5,
    });
  });
});
