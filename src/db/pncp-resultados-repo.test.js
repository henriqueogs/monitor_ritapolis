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

const { listarDocumentosPorNumeroPncp, gravarResultadoPncp } = require('./pncp-resultados-repo');
const { escolherDocumentoCanonico } = require('../licitacoes/pncp-resultados');
const { ehValorFinalDeEmpenho } = require('../transparencia/valor-final-empenho');

const CONTROLE = '00000000000191-1-000001/2025';

function seedDocumento({ fonte, ano = 2025, detalhes = null }) {
  const { lastInsertRowid } = mockConn
    .prepare(
      `INSERT INTO documentos (fonte, tipo, titulo, url_origem, ano)
       VALUES (?, 'edital', 'Pregão 1/2025', 'https://exemplo.gov.br/origem', ?)`
    )
    .run(fonte, ano);
  const id = Number(lastInsertRowid);
  if (detalhes) {
    mockConn
      .prepare(
        `INSERT INTO licitacoes_detalhes (documento_id, vencedor_nome, vencedor_cnpj, valor_final,
           numero_pncp, data_homologacao, origem, origem_detalhe, trecho_fonte, confianca)
         VALUES (@id, @vencedor_nome, @vencedor_cnpj, @valor_final, @numero_pncp, @data_homologacao,
           @origem, @origem_detalhe, @trecho_fonte, @confianca)`
      )
      .run({
        id,
        vencedor_nome: null,
        vencedor_cnpj: null,
        valor_final: null,
        numero_pncp: CONTROLE,
        data_homologacao: null,
        origem: null,
        origem_detalhe: null,
        trecho_fonte: null,
        confianca: null,
        ...detalhes,
      });
  }
  return id;
}

function detalhes(id) {
  return mockConn.prepare('SELECT * FROM licitacoes_detalhes WHERE documento_id = ?').get(id);
}

function somaPorAno(ano) {
  return mockConn
    .prepare(
      `SELECT COALESCE(SUM(ld.valor_final), 0) AS total
       FROM licitacoes_detalhes ld JOIN documentos d ON d.id = ld.documento_id WHERE d.ano = ?`
    )
    .get(ano).total;
}

const RESULTADO_UNICO = {
  vencedor_nome: 'Fornecedor A',
  vencedor_cnpj: '11222333000181',
  multiplos_fornecedores: false,
  valor_final: 2000,
  numero_pncp: CONTROLE,
  data_resultado: '2025-03-12',
};

describe('pncp-resultados-repo', () => {
  beforeEach(() => {
    mockConn.exec('DELETE FROM licitacoes_detalhes; DELETE FROM documentos;');
  });

  it('com edital do site e compra do PNCP no mesmo processo, o valor entra uma vez só no ano', () => {
    // Arrange: site já tinha valor lido do texto; o coletor do PNCP trouxe a compra sem valor.
    const site = seedDocumento({
      fonte: 'site_prefeitura',
      detalhes: { valor_final: 900, origem: 'texto_ia', trecho_fonte: 'valor de 900', confianca: 0.6 },
    });
    seedDocumento({ fonte: 'pncp', detalhes: {} });

    // Act
    const docs = listarDocumentosPorNumeroPncp(CONTROLE);
    const canonico = escolherDocumentoCanonico(docs);
    gravarResultadoPncp(canonico.id, RESULTADO_UNICO);

    // Assert
    expect(docs).toHaveLength(2);
    expect(canonico.id).toBe(site);
    expect(somaPorAno(2025)).toBe(2000);
  });

  it('troca a origem e limpa o trecho/confiança do valor anterior (empenho ou texto)', () => {
    const id = seedDocumento({
      fonte: 'site_prefeitura',
      detalhes: {
        vencedor_nome: 'Antigo',
        valor_final: 3100,
        origem: 'portal_transparencia',
        origem_detalhe: 'empenho_agregado',
        trecho_fonte: 'empenhos somados',
        confianca: 0.9,
        data_homologacao: '2024-01-01',
      },
    });

    gravarResultadoPncp(id, RESULTADO_UNICO);

    expect(detalhes(id)).toMatchObject({
      vencedor_nome: 'Fornecedor A',
      vencedor_cnpj: '11222333000181',
      valor_final: 2000,
      origem: 'pncp_orgaos',
      origem_detalhe: 'pncp_resultados',
      trecho_fonte: null,
      confianca: null,
      data_homologacao: '2025-03-12',
    });
    // O guard de exibição e a limpeza de valor de empenho não podem esconder/apagar o homologado.
    expect(ehValorFinalDeEmpenho(detalhes(id))).toBe(false);
  });

  it('vários fornecedores: apaga o vencedor antigo em vez de deixá-lo ao lado do total', () => {
    const id = seedDocumento({
      fonte: 'site_prefeitura',
      detalhes: { vencedor_nome: 'A (texto)', vencedor_cnpj: '11222333000181', origem: 'texto_ia' },
    });

    gravarResultadoPncp(id, {
      ...RESULTADO_UNICO,
      vencedor_nome: null,
      vencedor_cnpj: null,
      multiplos_fornecedores: true,
    });

    expect(detalhes(id)).toMatchObject({ vencedor_nome: null, vencedor_cnpj: null, valor_final: 2000 });
  });

  it('cria os detalhes quando o documento ainda não tinha e mantém o numero_pncp existente', () => {
    const id = seedDocumento({ fonte: 'pncp' });

    gravarResultadoPncp(id, RESULTADO_UNICO);

    expect(detalhes(id)).toMatchObject({ numero_pncp: CONTROLE, valor_final: 2000, origem: 'pncp_orgaos' });
  });

  it('recusa gravar sem valor final (o chamador só grava compra fechada e precificada)', () => {
    const id = seedDocumento({ fonte: 'site_prefeitura', detalhes: {} });

    expect(() => gravarResultadoPncp(id, { ...RESULTADO_UNICO, valor_final: null })).toThrow('valor_final');
  });
});
