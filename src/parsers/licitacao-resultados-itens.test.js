'use strict';

const { parseResultadosItensLicitacao } = require('./licitacao-resultados-itens');

describe('parsers/licitacao-resultados-itens', () => {
  it('nao quebra quando a secao de classificacao nao tem marcador final', () => {
    const texto = [
      'CLASSIFICACAO',
      'Item: 1 - Servico de transporte escolar',
      'Fornecedor Valor Classificacao',
      'EMPRESA TESTE LTDA R$ 1.234,56 1 - Lugar',
    ].join('\n');

    expect(() => parseResultadosItensLicitacao(texto)).not.toThrow();
    expect(parseResultadosItensLicitacao(texto)).toHaveLength(1);
  });

  it('retorna lista vazia para texto vazio', () => {
    expect(parseResultadosItensLicitacao('')).toEqual([]);
  });

  it('extrai vencedor de ata de plataforma eletronica por item', () => {
    const texto = [
      'Abriu-se em seguida a fase de lances para classificacao dos licitantes.',
      'Item 2 - PNEU 175/70 R14 Status: Aprovado',
      'Descricao complementar: Quantidade: 144 Estimado: 264,2900 Unidade de medida: UN',
      'Classificacao Posicao Licitante CNPJ/CPF Oferta Status',
      '1° RAVI E-COMMERCE LTDA. 52954144000180 264,0000 Vencedor',
      '2° OUTRA EMPRESA LTDA 11111111000111 318,0000 Classificado'
    ].join(' ');

    const resultados = parseResultadosItensLicitacao(texto);

    expect(resultados).toHaveLength(1);
    expect(resultados[0]).toMatchObject({
      item_numero: '2',
      descricao: 'PNEU 175/70 R14',
      valor_unitario_final: 264,
      fornecedor_nome: 'RAVI E-COMMERCE LTDA.',
      fornecedor_cnpj: '52954144000180'
    });
  });

  it('extrai vencedor de ata de plataforma eletronica por lote', () => {
    const texto = [
      'Lote 1 Status: Aprovado',
      'Descricao complementar: Conjunto de Fantoche Familia Branca Quantidade: 515 Estimado: 210.575,2500',
      'Classificacao Posicao Licitante CNPJ/CPF Oferta Status',
      '1° PUBLIX EMPREENDIMENTOS COMERCIAIS LTDA 57059013000153 153.000,0000 Vencedor'
    ].join(' ');

    const resultados = parseResultadosItensLicitacao(texto);

    expect(resultados).toHaveLength(1);
    expect(resultados[0]).toMatchObject({
      item_numero: '1',
      lote_numero: '1',
      valor_unitario_final: 153000,
      valor_final_tipo: 'lote'
    });
  });

  it('usa resultado declarado quando a classificacao tem OCR ruim', () => {
    const texto = [
      'RESULTADO A vista da habilitacao, foi declarado:',
      '1- AREIA. COMERCIAL RIO PARAISO LTDA - EPP. | R$750,00 Vencedor;',
      '2- CASCALHO| COMERCIAL RIO PARAISO LTDA - EPP. | R$ 790,00 Vencedor;',
      'ENCERRAMENTO'
    ].join(' ');

    const resultados = parseResultadosItensLicitacao(texto);

    expect(resultados).toHaveLength(2);
    expect(resultados[0]).toMatchObject({
      item_numero: '1',
      valor_unitario_final: 750
    });
  });
});
