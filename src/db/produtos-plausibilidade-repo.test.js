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

const {
  aplicarGatePlausibilidadeItemProcesso,
  FONTE_VALIDACAO,
} = require('./produtos-plausibilidade-repo');

function seedDocumentoComValor(id, valorFinal) {
  mockConn
    .prepare(
      `INSERT INTO documentos (id, fonte, tipo, titulo, ano, url_origem)
       VALUES (?, 'site_prefeitura', 'edital', 'Doc ' || ?, 2026, 'https://x/y')`
    )
    .run(id, id);
  if (valorFinal !== null && valorFinal !== undefined) {
    mockConn
      .prepare(`INSERT INTO licitacoes_detalhes (documento_id, valor_final) VALUES (?, ?)`)
      .run(id, valorFinal);
  }
}

let seq = 0;
function seedProduto(documentoId, { lote = null, total = null, unit = null, qtd = null, statusRevisao = 'pendente' } = {}) {
  seq += 1;
  mockConn
    .prepare(
      `INSERT INTO licitacoes_produtos
         (documento_id, ano, item_numero, descricao, descricao_normalizada, quantidade,
          valor_unitario_final, valor_total_final, valor_lote_final, origem, origem_detalhe, hash_item, status_revisao)
       VALUES (?, 2026, ?, 'Item teste', 'item teste', ?, ?, ?, ?, 'ata_resultado', 'ata:negociacao', ?, ?)`
    )
    .run(documentoId, String(seq), qtd, unit, total, lote, `hash-${seq}`, statusRevisao);
  return mockConn.prepare('SELECT last_insert_rowid() AS id').get().id;
}

function getProduto(id) {
  return mockConn.prepare('SELECT * FROM licitacoes_produtos WHERE id = ?').get(id);
}

function getValidacoes(produtoId) {
  return mockConn
    .prepare('SELECT * FROM licitacoes_produtos_validacoes WHERE produto_id = ? AND fonte = ?')
    .all(produtoId, FONTE_VALIDACAO);
}

describe('produtos-plausibilidade-repo', () => {
  beforeEach(() => {
    mockConn.exec(
      'DELETE FROM licitacoes_produtos_validacoes; DELETE FROM licitacoes_produtos; DELETE FROM licitacoes_detalhes; DELETE FROM documentos;'
    );
    seq = 0;
  });

  it('quarentena o caso doc/5: lote R$ 4.815.000 num processo de R$ 176.186,20', () => {
    seedDocumentoComValor(5, 176186.2);
    const pid = seedProduto(5, { lote: 4815000 });

    const r = aplicarGatePlausibilidadeItemProcesso({ documentoId: 5 });

    expect(r.quarentenados).toBe(1);
    const p = getProduto(pid);
    expect(p.status_revisao).toBe('rejeitado');
    expect(p.origem_detalhe).toContain('valor_item_implausivel');
    expect(p.valor_lote_final).toBe(4815000); // valor intacto — não destrutivo

    const validacoes = getValidacoes(pid);
    expect(validacoes).toHaveLength(1);
    expect(validacoes[0].status).toBe('implausivel');
    expect(validacoes[0].valor_encontrado).toBe(176186.2);
    expect(validacoes[0].campo_validado).toBe('valor_lote_final');
  });

  it('é idempotente — 2 execuções, uma anotação e uma validação', () => {
    seedDocumentoComValor(5, 176186.2);
    const pid = seedProduto(5, { lote: 4815000 });

    aplicarGatePlausibilidadeItemProcesso({ documentoId: 5 });
    const r2 = aplicarGatePlausibilidadeItemProcesso({ documentoId: 5 });

    expect(r2.ja_quarentenados).toBe(1);
    expect(r2.quarentenados).toBe(0);
    const p = getProduto(pid);
    expect((p.origem_detalhe.match(/valor_item_implausivel/g) || []).length).toBe(1);
    expect(getValidacoes(pid)).toHaveLength(1);
  });

  it('dry-run não grava nada', () => {
    seedDocumentoComValor(5, 176186.2);
    const pid = seedProduto(5, { lote: 4815000 });

    const r = aplicarGatePlausibilidadeItemProcesso({ documentoId: 5, dryRun: true });

    expect(r.quarentenados).toBe(1);
    expect(r.detalhes).toHaveLength(1);
    expect(getProduto(pid).status_revisao).toBe('pendente');
    expect(getValidacoes(pid)).toHaveLength(0);
  });

  it('libera produto que ficou plausível após correção (só se foi o gate que rejeitou)', () => {
    seedDocumentoComValor(5, 176186.2);
    const pid = seedProduto(5, { unit: 4815000, qtd: 8 });
    aplicarGatePlausibilidadeItemProcesso({ documentoId: 5 });
    expect(getProduto(pid).status_revisao).toBe('rejeitado');

    // Correção (reprocessamento): vira lote plausível
    mockConn
      .prepare(
        `UPDATE licitacoes_produtos SET valor_unitario_final=NULL, valor_total_final=NULL, valor_lote_final=48150 WHERE id=?`
      )
      .run(pid);
    const r = aplicarGatePlausibilidadeItemProcesso({ documentoId: 5 });

    expect(r.liberados).toBe(1);
    const p = getProduto(pid);
    expect(p.status_revisao).toBe('pendente');
    expect(p.origem_detalhe).not.toContain('valor_item_implausivel');
    expect(getValidacoes(pid)[0].status).toBe('validado');
  });

  it('produto validado por humano nunca é rebaixado', () => {
    seedDocumentoComValor(5, 176186.2);
    const pid = seedProduto(5, { lote: 4815000, statusRevisao: 'validado' });

    const r = aplicarGatePlausibilidadeItemProcesso({ documentoId: 5 });

    expect(getProduto(pid).status_revisao).toBe('validado');
    // ainda registra a validação implausível pra auditoria
    expect(getValidacoes(pid)[0]?.status).toBe('implausivel');
    expect(r.quarentenados).toBe(0);
  });

  it('documento sem valor_final → nada acontece', () => {
    seedDocumentoComValor(7, null);
    const pid = seedProduto(7, { lote: 4815000 });

    const r = aplicarGatePlausibilidadeItemProcesso({ documentoId: 7 });

    expect(r.avaliados).toBe(0);
    expect(getProduto(pid).status_revisao).toBe('pendente');
  });

  it('item plausível não é tocado', () => {
    seedDocumentoComValor(5, 176186.2);
    const pid = seedProduto(5, { unit: 450, qtd: 8 });

    const r = aplicarGatePlausibilidadeItemProcesso({ documentoId: 5 });

    expect(r.quarentenados).toBe(0);
    expect(getProduto(pid).status_revisao).toBe('pendente');
    expect(getValidacoes(pid)).toHaveLength(0);
  });
});
