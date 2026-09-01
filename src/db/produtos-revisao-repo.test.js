'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const {
  STATUS_REVISAO,
  contarProdutosRevisao,
  listProdutosParaRevisao,
  setProdutoStatusRevisao,
  validarLoteProdutos,
} = require('./produtos-revisao-repo');

function criarBancoMemoria() {
  const conn = new DatabaseSync(':memory:');
  const schema = fs.readFileSync(path.resolve(__dirname, 'schema.sql'), 'utf8');
  conn.exec(schema);
  return conn;
}

function semearDocumento(conn, id, numero) {
  conn
    .prepare(
      `INSERT INTO documentos (id, fonte, tipo, numero, ano, titulo, url_origem)
       VALUES (?, 'site_prefeitura', 'edital', ?, 2024, ?, 'http://x')`
    )
    .run(id, numero, `Documento ${numero}`);
}

function semearProduto(conn, { documentoId, descricao, confianca, hashItem, status = 'pendente' }) {
  conn
    .prepare(
      `INSERT INTO licitacoes_produtos (documento_id, descricao, confianca, status_revisao, hash_item, origem)
       VALUES (?, ?, ?, ?, ?, 'ia_resumo')`
    )
    .run(documentoId, descricao, confianca, status, hashItem);
}

describe('produtos-revisao-repo', () => {
  let conn;

  beforeEach(() => {
    conn = criarBancoMemoria();
    semearDocumento(conn, 1, 'PP-001/2024');
    semearDocumento(conn, 2, 'PP-002/2024');
    semearProduto(conn, { documentoId: 1, descricao: 'item alta conf', confianca: 0.95, hashItem: 'h1' });
    semearProduto(conn, { documentoId: 1, descricao: 'item baixa conf', confianca: 0.3, hashItem: 'h2' });
    semearProduto(conn, { documentoId: 2, descricao: 'item media conf', confianca: 0.6, hashItem: 'h3' });
    semearProduto(conn, {
      documentoId: 2,
      descricao: 'item ja validado',
      confianca: 0.9,
      hashItem: 'h4',
      status: 'validado',
    });
  });

  afterEach(() => conn.close());

  describe('contarProdutosRevisao', () => {
    it('conta por status', () => {
      const r = contarProdutosRevisao(conn);
      const pendentes = r.por_status.find((s) => s.status === 'pendente');
      const validados = r.por_status.find((s) => s.status === 'validado');
      expect(pendentes.n).toBe(3);
      expect(validados.n).toBe(1);
    });
  });

  describe('listProdutosParaRevisao', () => {
    it('lista apenas pendentes, do menos confiável para o mais', () => {
      const { itens } = listProdutosParaRevisao({}, conn);
      expect(itens).toHaveLength(3);
      expect(itens[0].confianca).toBe(0.3);
      expect(itens[itens.length - 1].confianca).toBe(0.95);
    });

    it('filtra por confiança máxima (só os suspeitos)', () => {
      const { itens } = listProdutosParaRevisao({ confiancaMax: 0.5 }, conn);
      expect(itens).toHaveLength(1);
      expect(itens[0].descricao).toBe('item baixa conf');
    });

    it('filtra por documento', () => {
      const { total } = listProdutosParaRevisao({ documentoId: 1 }, conn);
      expect(total).toBe(2);
    });

    it('inclui o número do documento como contexto', () => {
      const { itens } = listProdutosParaRevisao({ documentoId: 1 }, conn);
      expect(itens[0].documento_numero).toBe('PP-001/2024');
    });

    it('inclui a origem do documento — sem isso o admin não tem como validar o trecho contra a fonte', () => {
      const { itens } = listProdutosParaRevisao({ documentoId: 1 }, conn);
      expect(itens[0].documento_url_origem).toBe('http://x');
    });
  });

  describe('setProdutoStatusRevisao', () => {
    it('valida um produto pendente', () => {
      const pend = listProdutosParaRevisao({ documentoId: 1 }, conn).itens[0];
      const atualizado = setProdutoStatusRevisao(pend.id, STATUS_REVISAO.VALIDADO, conn);
      expect(atualizado.status_revisao).toBe('validado');
    });

    it('rejeita status inválido', () => {
      const pend = listProdutosParaRevisao({ documentoId: 1 }, conn).itens[0];
      expect(() => setProdutoStatusRevisao(pend.id, 'qualquer', conn)).toThrow();
    });
  });

  describe('validarLoteProdutos', () => {
    it('valida em lote os pendentes acima da confiança mínima', () => {
      const n = validarLoteProdutos({ confiancaMin: 0.8 }, conn);
      expect(n).toBe(1); // só o item 0.95 (o 0.9 já estava validado)
      const r = contarProdutosRevisao(conn);
      expect(r.por_status.find((s) => s.status === 'validado').n).toBe(2);
    });

    it('restringe o lote a um documento', () => {
      const n = validarLoteProdutos({ documentoId: 2, confiancaMin: 0.5 }, conn);
      expect(n).toBe(1); // item media conf 0.6 do doc 2
    });
  });
});
