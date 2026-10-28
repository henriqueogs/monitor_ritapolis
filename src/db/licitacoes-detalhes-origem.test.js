'use strict';

// Invariante: origem / origem_detalhe / trecho_fonte / confianca de licitacoes_detalhes descrevem
// o valor_final gravado (fiscal-valores 28/10, reauditoria do rótulo de valor). Os escritores de
// texto, IA e coleta só trocam a procedência quando também gravam o valor.

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

const { upsertLicitacaoDetalhesExtraidos, saveDocumento } = require('./index');
const { extractEntitiesFromResumes } = require('../ai/extract-entities');
const { ehValorFinalDeEmpenho } = require('../transparencia/valor-final-empenho');

let seq = 0;

function documentoColeta() {
  seq += 1;
  return {
    fonte: 'site_prefeitura',
    tipo: 'edital',
    titulo: `Pregão ${seq}/2025`,
    numero: `${seq}/2025`,
    url_origem: `https://exemplo.gov.br/origem/${seq}`,
    ano: 2025,
    hash_conteudo: `hash-${seq}`,
  };
}

function seedDocumento(detalhes = null) {
  const { lastInsertRowid } = mockConn
    .prepare(
      `INSERT INTO documentos (fonte, tipo, titulo, url_origem, ano)
       VALUES ('site_prefeitura', 'edital', 'Pregão', 'https://exemplo.gov.br/origem', 2025)`
    )
    .run();
  const id = Number(lastInsertRowid);
  if (detalhes) {gravarDetalhes(id, detalhes);}
  return id;
}

function gravarDetalhes(id, detalhes) {
  mockConn
    .prepare(
      `INSERT OR REPLACE INTO licitacoes_detalhes (documento_id, vencedor_nome, valor_final, origem,
         origem_detalhe, trecho_fonte, confianca)
       VALUES (@id, @vencedor_nome, @valor_final, @origem, @origem_detalhe, @trecho_fonte, @confianca)`
    )
    .run({
      id,
      vencedor_nome: null,
      valor_final: null,
      origem: null,
      origem_detalhe: null,
      trecho_fonte: null,
      confianca: null,
      ...detalhes,
    });
}

function detalhes(id) {
  return mockConn.prepare('SELECT * FROM licitacoes_detalhes WHERE documento_id = ?').get(id);
}

function resumoComValor(id, valor) {
  mockConn
    .prepare(
      `INSERT INTO documentos_resumos_ai (documento_id, provider, modelo, contrato_versao, resumo_json, texto_hash)
       VALUES (?, 'teste', 'teste', 'v1', ?, ?)`
    )
    .run(id, JSON.stringify({ valores: [{ tipo: 'final', valor }] }), `h-${id}`);
}

const DO_CONTRATO = {
  vencedor_nome: 'Fornecedor do Contrato',
  origem: 'texto_contrato',
  origem_detalhe: 'contrato.pdf',
  trecho_fonte: 'CONTRATADA: Fornecedor do Contrato',
  confianca: 0.7,
};

describe('licitacoes_detalhes: origem descreve o valor_final', () => {
  beforeEach(() => {
    mockConn.exec('DELETE FROM documentos_resumos_ai; DELETE FROM licitacoes_detalhes;');
  });

  it('caso A: valor da IA numa linha com vencedor do contrato passa a ter origem resumo_ai', () => {
    // Arrange
    const id = seedDocumento();
    upsertLicitacaoDetalhesExtraidos({ id }, { ...DO_CONTRATO, valor_final: null });
    resumoComValor(id, 999);

    // Act
    extractEntitiesFromResumes();

    // Assert
    expect(detalhes(id)).toMatchObject({
      vencedor_nome: 'Fornecedor do Contrato',
      valor_final: 999,
      origem: 'resumo_ai',
      origem_detalhe: null,
      trecho_fonte: null,
      confianca: null,
    });
  });

  it('caso B: texto que não sobrescreve o valor da IA não troca a origem', () => {
    // Arrange
    const id = seedDocumento({ valor_final: 777, origem: 'resumo_ai' });

    // Act
    upsertLicitacaoDetalhesExtraidos({ id }, { ...DO_CONTRATO, valor_final: 120000 });

    // Assert
    expect(detalhes(id)).toMatchObject({
      vencedor_nome: 'Fornecedor do Contrato',
      valor_final: 777,
      origem: 'resumo_ai',
      origem_detalhe: null,
      trecho_fonte: null,
      confianca: null,
    });
  });

  it('texto que substitui valor de texto troca origem, detalhe, trecho e confiança juntos', () => {
    // Arrange
    const id = seedDocumento({
      valor_final: 500,
      origem: 'texto_ata',
      origem_detalhe: 'ata.pdf',
      trecho_fonte: 'registrado por 500',
      confianca: 0.6,
    });

    // Act
    upsertLicitacaoDetalhesExtraidos({ id }, { ...DO_CONTRATO, valor_final: 600, origem_detalhe: null });

    // Assert
    expect(detalhes(id)).toMatchObject({
      valor_final: 600,
      origem: 'texto_contrato',
      origem_detalhe: null,
      trecho_fonte: DO_CONTRATO.trecho_fonte,
      confianca: 0.7,
    });
  });

  it('valor do texto numa linha de vencedor por empenho não herda o rótulo empenho_agregado', () => {
    // Arrange: transparencia-repo grava vencedor por empenho sem valor (origem descreve nada).
    const id = seedDocumento({
      vencedor_nome: 'Credor do Empenho',
      origem: 'portal_transparencia',
      origem_detalhe: 'empenho_agregado',
    });

    // Act
    upsertLicitacaoDetalhesExtraidos({ id }, { ...DO_CONTRATO, valor_final: 300, origem_detalhe: null });

    // Assert
    expect(detalhes(id)).toMatchObject({ valor_final: 300, origem: 'texto_contrato', origem_detalhe: null });
    expect(ehValorFinalDeEmpenho(detalhes(id))).toBe(false);
  });

  it('IA que não grava valor (já existe) não troca a origem', () => {
    // Arrange
    const id = seedDocumento({ valor_final: 500, origem: 'texto_ata', origem_detalhe: 'ata.pdf' });
    resumoComValor(id, 999);

    // Act
    extractEntitiesFromResumes();

    // Assert
    expect(detalhes(id)).toMatchObject({ valor_final: 500, origem: 'texto_ata', origem_detalhe: 'ata.pdf' });
  });

  it('valor regravado depois do gate mantém o rastro valor_final_invalidado', () => {
    // Arrange: scripts/aplicar-gate-valores.js zera o valor e anota o motivo em origem_detalhe.
    const id = seedDocumento({
      origem: 'texto_contrato',
      origem_detalhe: 'contrato.pdf | valor_final_invalidado(900000,acima_do_teto)',
    });
    resumoComValor(id, 900000);

    // Act
    extractEntitiesFromResumes();

    // Assert
    expect(detalhes(id)).toMatchObject({
      valor_final: 900000,
      origem: 'resumo_ai',
      origem_detalhe: 'valor_final_invalidado(900000,acima_do_teto)',
    });
  });

  describe('coleta (saveDocumento)', () => {
    it('sem valor não troca a origem do valor existente', () => {
      // Arrange
      const doc = documentoColeta();
      const { id } = saveDocumento(doc);
      gravarDetalhes(id, { valor_final: 500, origem: 'texto_ata', origem_detalhe: 'ata.pdf' });

      // Act
      saveDocumento({
        ...doc,
        licitacao_detalhes: { modalidade: 'Pregão', origem: 'coleta_site', origem_detalhe: 'listagem' },
      });

      // Assert
      expect(detalhes(id)).toMatchObject({
        modalidade: 'Pregão',
        valor_final: 500,
        origem: 'texto_ata',
        origem_detalhe: 'ata.pdf',
      });
    });

    it('com valor troca origem e detalhe junto com o valor', () => {
      // Arrange
      const doc = documentoColeta();
      const { id } = saveDocumento(doc);
      gravarDetalhes(id, { valor_final: 500, origem: 'texto_ata', origem_detalhe: 'ata.pdf', trecho_fonte: 't' });

      // Act
      saveDocumento({ ...doc, licitacao_detalhes: { valor_final: 650, origem: 'coleta_site' } });

      // Assert
      expect(detalhes(id)).toMatchObject({
        valor_final: 650,
        origem: 'coleta_site',
        origem_detalhe: null,
        trecho_fonte: null,
      });
    });
  });
});
