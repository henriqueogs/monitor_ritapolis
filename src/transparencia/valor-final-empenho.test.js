'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const {
  diagnosticarValorFinalDeEmpenho,
  limparValorFinalDeEmpenho,
  listarValorFinalDeEmpenho,
} = require('./valor-final-empenho');

function criarBancoMemoria() {
  const conn = new DatabaseSync(':memory:');
  conn.exec(fs.readFileSync(path.resolve(__dirname, '../db/schema.sql'), 'utf8'));
  return conn;
}

function detalhe(conn, id, { valor, origemDetalhe = null, origem = 'texto_edital', cnpj = '11111111111111' }) {
  conn.prepare("INSERT INTO documentos (id, fonte, tipo, numero, ano, titulo, url_origem) VALUES (?, 'site_prefeitura', 'edital', ?, 2026, 'T', 'https://x')").run(id, `${id}/2026`);
  conn
    .prepare('INSERT INTO licitacoes_detalhes (documento_id, vencedor_cnpj, valor_final, origem, origem_detalhe) VALUES (?, ?, ?, ?, ?)')
    .run(id, cnpj, valor, origem, origemDetalhe);
}

describe('valor-final-empenho (saneamento do valor_final derivado de empenho)', () => {
  let conn;
  beforeEach(() => {
    conn = criarBancoMemoria();
    detalhe(conn, 1, { valor: 900 });
    detalhe(conn, 2, { valor: 5000, origem: 'portal_transparencia', origemDetalhe: 'empenho_agregado' });
    detalhe(conn, 3, { valor: 300, origem: 'portal_transparencia', origemDetalhe: 'empenho_agregado | valor_final_invalidado(1,x)' });
    // origem_detalhe com nome de arquivo = valor de ata/contrato: NAO e derivado de empenho (preservado)
    detalhe(conn, 4, { valor: 200, origem: 'portal_transparencia', origemDetalhe: 'ATA.pdf' });
    detalhe(conn, 5, { valor: 100, origem: 'portal_transparencia', origemDetalhe: null });
  });

  it('diagnostico conta registros e soma sem alterar nada', () => {
    expect(diagnosticarValorFinalDeEmpenho(conn)).toEqual({ n: 3, valor_total: 5400 });
    expect(conn.prepare('SELECT COUNT(*) n FROM licitacoes_detalhes WHERE valor_final IS NOT NULL').get().n).toBe(5);
  });

  it('limpar zera so o valor derivado de empenho e preserva vencedor e origem para auditoria', () => {
    const r = limparValorFinalDeEmpenho(conn);

    expect(r).toEqual({ n: 3 });
    const linhas = conn.prepare('SELECT documento_id, valor_final, vencedor_cnpj, origem_detalhe FROM licitacoes_detalhes ORDER BY documento_id').all();
    expect(linhas[0]).toMatchObject({ valor_final: 900 });
    expect(linhas[1]).toMatchObject({ valor_final: null, vencedor_cnpj: '11111111111111', origem_detalhe: 'empenho_agregado' });
    expect(linhas[2].valor_final).toBeNull();
    expect(linhas[3].valor_final).toBe(200); // nome de arquivo: ata/contrato, preservado
    expect(linhas[4].valor_final).toBeNull(); // legado sem detalhe
  });

  it('lista as linhas afetadas (insumo do backup antes do --apply)', () => {
    const linhas = listarValorFinalDeEmpenho(conn);

    expect(linhas.map((l) => l.documento_id)).toEqual([2, 3, 5]);
    expect(linhas[0]).toMatchObject({ valor_final: 5000, origem: 'portal_transparencia', origem_detalhe: 'empenho_agregado' });
  });

  it('idempotente: segunda execucao nao altera mais nada', () => {
    limparValorFinalDeEmpenho(conn);

    expect(limparValorFinalDeEmpenho(conn)).toEqual({ n: 0 });
    expect(diagnosticarValorFinalDeEmpenho(conn)).toEqual({ n: 0, valor_total: 0 });
  });
});
