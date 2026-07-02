'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

function criarBancoMemoria() {
  const conn = new DatabaseSync(':memory:');
  conn.exec(fs.readFileSync(path.resolve(__dirname, 'schema.sql'), 'utf8'));
  return conn;
}

const mockConn = criarBancoMemoria();
jest.mock('./connection', () => ({ db: mockConn }));

const { enriquecerProdutosComResultadosAnexo } = require('./index');

const ATA_FIXTURE = [
  'NEGOCIACAO',
  'Item: 8 - LOTE 00008 Direct Box ativo',
  'Fornecedor Valor Negociado Valor Vencedor Situacao',
  'HYAGO E. SANTOS PROMOCOES-ME R$ 4.900.000,00 R$ 4.815.000,00 Vencedor',
].join(' ');

describe('enriquecerProdutosComResultadosAnexo — merge de resultado com produto do edital', () => {
  beforeEach(() => {
    mockConn.exec('DELETE FROM licitacoes_produtos; DELETE FROM documentos_anexos; DELETE FROM documentos;');
    mockConn
      .prepare(
        `INSERT INTO documentos (id, fonte, tipo, titulo, numero, ano, url_origem)
         VALUES (5, 'site_prefeitura', 'edital', 'Pregão 006/2026 - Estrutura de Eventos', '0031/2026', 2026, 'https://x/y')`
      )
      .run();
  });

  function seedProdutoDoEdital({ unitErrado = null, totalErrado = null } = {}) {
    mockConn
      .prepare(
        `INSERT INTO licitacoes_produtos
           (documento_id, ano, item_numero, descricao, descricao_normalizada, quantidade,
            valor_unitario_final, valor_total_final, valor_final_tipo, origem, hash_item, status_revisao)
         VALUES (5, 2026, '8', 'Direct Box ativo', 'direct box ativo', 8, ?, ?, ?, 'tabela_edital', 'hash-8', 'pendente')`
      )
      .run(unitErrado, totalErrado, unitErrado ? 'unitario' : null);
    return mockConn.prepare('SELECT last_insert_rowid() AS id').get().id;
  }

  it('CASO doc/5: valor de LOTE não vira unitário × quantidade', () => {
    seedProdutoDoEdital();

    const resumo = enriquecerProdutosComResultadosAnexo({ documentoId: 5, anexoId: 999, texto: ATA_FIXTURE });

    expect(resumo.itens_resultado_extraidos).toBe(1);
    expect(resumo.produtos_atualizados).toBe(1);

    const p = mockConn.prepare("SELECT * FROM licitacoes_produtos WHERE documento_id = 5 AND item_numero = '8'").get();
    expect(p.valor_final_tipo).toBe('lote');
    expect(p.valor_lote_final).toBe(4815000);
    expect(p.valor_unitario_final).toBeNull();
    expect(p.valor_total_final).toBeNull();
  });

  it('reprocessamento LIMPA valores errados antigos (unit 4.815.000 / total 38.520.000)', () => {
    seedProdutoDoEdital({ unitErrado: 4815000, totalErrado: 38520000 });

    enriquecerProdutosComResultadosAnexo({ documentoId: 5, anexoId: 999, texto: ATA_FIXTURE });

    const p = mockConn.prepare("SELECT * FROM licitacoes_produtos WHERE item_numero = '8'").get();
    expect(p.valor_final_tipo).toBe('lote');
    expect(p.valor_lote_final).toBe(4815000);
    expect(p.valor_unitario_final).toBeNull();
    expect(p.valor_total_final).toBeNull();
  });

  it('não duplica produto (COUNT estável pós-merge)', () => {
    seedProdutoDoEdital();
    enriquecerProdutosComResultadosAnexo({ documentoId: 5, anexoId: 999, texto: ATA_FIXTURE });
    enriquecerProdutosComResultadosAnexo({ documentoId: 5, anexoId: 999, texto: ATA_FIXTURE });

    const n = mockConn.prepare('SELECT COUNT(*) n FROM licitacoes_produtos WHERE documento_id = 5').get().n;
    expect(n).toBe(1);
  });

  it('item unitário de verdade continua multiplicando (regressão)', () => {
    mockConn
      .prepare(
        `INSERT INTO licitacoes_produtos
           (documento_id, ano, item_numero, descricao, descricao_normalizada, quantidade, origem, hash_item, status_revisao)
         VALUES (5, 2026, '2', 'Caneta azul', 'caneta azul', 100, 'tabela_edital', 'hash-2', 'pendente')`
      )
      .run();
    const texto = [
      'NEGOCIACAO',
      'Item: 2 - Caneta azul',
      'Fornecedor Valor Negociado Valor Vencedor Situacao',
      'PAPELARIA TESTE LTDA R$ 2,00 R$ 1,80 Vencedor',
    ].join(' ');

    enriquecerProdutosComResultadosAnexo({ documentoId: 5, anexoId: 999, texto });

    const p = mockConn.prepare("SELECT * FROM licitacoes_produtos WHERE item_numero = '2'").get();
    expect(p.valor_final_tipo).toBe('unitario');
    expect(p.valor_unitario_final).toBe(1.8);
    expect(p.valor_total_final).toBe(180);
    expect(p.valor_lote_final).toBeNull();
  });
});
