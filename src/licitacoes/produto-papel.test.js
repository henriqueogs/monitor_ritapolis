'use strict';

const {
  limparDescricaoProduto,
  detectarLixoProduto,
  classificarPapelProduto,
  PAPEL,
} = require('./produto-papel');

describe('produto-papel', () => {
  describe('limparDescricaoProduto', () => {
    it('remove rodapé de e-mail que vazou pra descrição (item legítimo preservado)', () => {
      expect(limparDescricaoProduto('AZITROMICINA 40 MG/ ML E-mail: administracao@ritapolis.mg.gov.br')).toBe(
        'AZITROMICINA 40 MG/ ML'
      );
      expect(limparDescricaoProduto('BALDE PLÁSTICO 10 L E-mail: administracao@ritapolis.mg.gov.br')).toBe(
        'BALDE PLÁSTICO 10 L'
      );
    });

    it('corta cabeçalho de tabela e boilerplate de ata', () => {
      expect(limparDescricaoProduto('CANETA AZUL Fornecedor Valor Negociado Valor Vencedor')).toBe('CANETA AZUL');
      expect(limparDescricaoProduto('X À vista da habilitação, foi declarado: Produto')).toBe('X');
    });

    it('não altera descrição limpa', () => {
      expect(limparDescricaoProduto('COBERTURA FOTOGRÁFICA EVENTO')).toBe('COBERTURA FOTOGRÁFICA EVENTO');
    });

    it('trata nulo/vazio', () => {
      expect(limparDescricaoProduto(null)).toBe('');
      expect(limparDescricaoProduto('   ')).toBe('');
    });
  });

  describe('detectarLixoProduto', () => {
    it('marca lixo quando sobra só ruído após limpeza', () => {
      expect(detectarLixoProduto({ descricao: '2637 E-mail: gabinete@ritapolis' }).lixo).toBe(true);
      expect(detectarLixoProduto({ descricao: '1136 &rrápes E À vista da habilitação, foi declarado' }).lixo).toBe(true);
    });

    it('NÃO marca item legítimo com descrição suja (recuperável)', () => {
      const r = detectarLixoProduto({
        descricao: 'AZITROMICINA 40 MG/ ML E-mail: administracao@ritapolis.mg.gov.br',
        item_numero: '13',
        quantidade: 100,
      });
      expect(r.lixo).toBe(false);
    });

    it('NÃO marca item real de descrição curta', () => {
      expect(detectarLixoProduto({ descricao: 'NOBREAK', fornecedor_nome: 'X LTDA' }).lixo).toBe(false);
      expect(detectarLixoProduto({ descricao: 'CESTA BÁSICA', quantidade: 10 }).lixo).toBe(false);
    });

    it('item_numero grande sozinho NÃO é lixo (códigos TCE legítimos)', () => {
      expect(
        detectarLixoProduto({ descricao: 'JOELHO PVC SOLDAVEL 20MM', item_numero: '20083', quantidade: 5 }).lixo
      ).toBe(false);
    });

    it('produto abreviado NÃO é lixo (evita falso-positivo)', () => {
      expect(detectarLixoProduto({ descricao: 'CD- RW 48 X 700 MB' }).lixo).toBe(false);
      expect(detectarLixoProduto({ descricao: 'R22' }).lixo).toBe(false);
      expect(detectarLixoProduto({ descricao: '7 MM' }).lixo).toBe(false);
    });

    it('marca fragmento sem letra (OCR de tabela) como lixo', () => {
      expect(detectarLixoProduto({ descricao: '5091' }).lixo).toBe(true);
      expect(detectarLixoProduto({ descricao: '| 128.90' }).lixo).toBe(true);
      expect(detectarLixoProduto({ descricao: '1.54%' }).lixo).toBe(true);
    });

    it('marca vazio sem nenhum dado', () => {
      expect(detectarLixoProduto({ descricao: '', quantidade: null, fornecedor_nome: null }).lixo).toBe(true);
      expect(detectarLixoProduto({ descricao: '..' }).lixo).toBe(true);
    });
  });

  describe('classificarPapelProduto', () => {
    it('lixo vence tudo', () => {
      expect(classificarPapelProduto({ descricao: '2637 E-mail: gabinete@ritapolis', valor_lote_final: 195000 })).toBe(
        PAPEL.DESCARTADO
      );
    });

    it('resultado global', () => {
      expect(classificarPapelProduto({ descricao: 'Serviço X', valor_global_final: 50000 })).toBe(PAPEL.RESULTADO_GLOBAL);
      expect(classificarPapelProduto({ descricao: 'Serviço X', valor_final_tipo: 'global' })).toBe(
        PAPEL.RESULTADO_GLOBAL
      );
    });

    it('resultado por lote (teto homologado — CASO doc/5 EQUIPE DE APOIO)', () => {
      expect(
        classificarPapelProduto({
          descricao: 'EQUIPE DE APOIO',
          lote_numero: '1',
          valor_lote_final: 195000,
          valor_final_tipo: 'lote',
          fornecedor_nome: 'HYAGO E. SANTOS',
        })
      ).toBe(PAPEL.RESULTADO_LOTE);
    });

    it('item de demanda (edital)', () => {
      expect(
        classificarPapelProduto({
          descricao: 'Cobertura fotográfica',
          item_numero: '3',
          quantidade: 10,
          valor_total_estimado: 24900,
        })
      ).toBe(PAPEL.ITEM);
    });

    it('item com resultado por item (preço unitário homologado) continua item', () => {
      expect(
        classificarPapelProduto({
          descricao: 'Caneta azul',
          item_numero: '2',
          quantidade: 100,
          valor_unitario_final: 1.8,
          valor_final_tipo: 'unitario',
        })
      ).toBe(PAPEL.ITEM);
    });
  });
});
