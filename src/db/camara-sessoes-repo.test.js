'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

function criarBancoMemoria() {
  const conn = new DatabaseSync(':memory:');
  conn.exec('PRAGMA foreign_keys = ON;');
  conn.exec(fs.readFileSync(path.resolve(__dirname, 'schema.sql'), 'utf8'));
  return conn;
}

const mockConn = criarBancoMemoria();
jest.mock('./connection', () => ({ db: mockConn }));

const {
  listarAtasComTexto,
  salvarSessao,
  getSessao,
  listarSessoes,
  listarIdsDeSessoes,
  listarPresencas,
  listarVotosNominais,
  listarVotacoes,
  contarCobertura,
} = require('./camara-sessoes-repo');

const TEXTO_LONGO = 'ata '.repeat(100);

function inserirAta({ tipo = 'ata_ordinaria', texto = TEXTO_LONGO, fonte = 'camara' } = {}) {
  return Number(
    mockConn
      .prepare(
        `INSERT INTO documentos (fonte, tipo, numero, ano, titulo, url_origem, url_pdf, texto_completo)
         VALUES (?, ?, '13', 2026, 'Ata 13', 'https://camara.exemplo/m/Legislacao', 'https://camara.exemplo/?Download=1', ?)`
      )
      .run(fonte, tipo, texto).lastInsertRowid
  );
}

function registro(documentoId, overrides = {}) {
  return {
    documentoId,
    sessao: {
      data_sessao: '2026-09-16',
      presidente: 'Gustavo Jr. Assis da Paixão',
      presentes: ['Gustavo Jr. Assis da Paixão', 'Luiz Paulo da Silva'],
      ausentes: [{ nome: 'Anna Paula Vieira Neto', justificada: true }],
      votacoes: [
        {
          materia: 'Projeto de Lei nº 22/2026',
          descricao: 'Operação de crédito',
          resultado: 'aprovado',
          votos_favoraveis: 5,
          votos_contrarios: 2,
          abstencoes: null,
          nominais: [{ nome: 'Luiz Paulo da Silva', voto: 'contrario' }],
          trecho: 'dois votos contrários dos vereadores Luiz Paulo e Matheus',
        },
      ],
    },
    avisos: [],
    status: 'ok',
    modelo: 'modelo-teste',
    textoHash: 'abc',
    versaoExtrator: 'sessao_ata_v1',
    ...overrides,
  };
}

describe('camara-sessoes-repo', () => {
  beforeEach(() => {
    mockConn.exec('DELETE FROM camara_sessoes; DELETE FROM documentos;');
  });

  describe('listarAtasComTexto', () => {
    it('lista só atas de sessão da Câmara com texto, e o que já foi extraído delas', () => {
      const comTexto = inserirAta();
      inserirAta({ texto: 'curto' });
      inserirAta({ tipo: 'portaria' });
      inserirAta({ fonte: 'prefeitura' });
      const extraida = inserirAta({ tipo: 'ata_extraordinaria' });
      salvarSessao(registro(extraida));

      const atas = listarAtasComTexto();

      expect(atas.map((a) => a.id).sort()).toEqual([comTexto, extraida].sort());
      expect(atas.find((a) => a.id === extraida)).toMatchObject({
        texto_hash: 'abc',
        versao_extrator: 'sessao_ata_v1',
      });
      expect(atas.find((a) => a.id === comTexto).texto_hash).toBeNull();
    });
  });

  describe('salvarSessao / getSessao', () => {
    it('grava presenças, votações e votos nominais com a origem da ata', () => {
      const id = inserirAta();

      salvarSessao(registro(id));

      const sessao = getSessao(id);
      expect(sessao).toMatchObject({
        data_sessao: '2026-09-16',
        status_validacao: 'ok',
        avisos: [],
        url_pdf: 'https://camara.exemplo/?Download=1',
      });
      expect(sessao.presencas).toEqual([
        { nome: 'Anna Paula Vieira Neto', situacao: 'ausente_justificada' },
        { nome: 'Gustavo Jr. Assis da Paixão', situacao: 'presente' },
        { nome: 'Luiz Paulo da Silva', situacao: 'presente' },
      ]);
      expect(sessao.votacoes[0]).toMatchObject({
        materia: 'Projeto de Lei nº 22/2026',
        votos_favoraveis: 5,
        nominais: [{ nome: 'Luiz Paulo da Silva', voto: 'contrario' }],
      });
    });

    it('regravar substitui em vez de duplicar', () => {
      const id = inserirAta();
      salvarSessao(registro(id));

      salvarSessao(registro(id, { status: 'com_avisos', avisos: ['algo'] }));

      expect(getSessao(id)).toMatchObject({ status_validacao: 'com_avisos', avisos: ['algo'] });
      expect(getSessao(id).presencas).toHaveLength(3);
      expect(listarVotosNominais()).toHaveLength(1);
    });

    it('getSessao retorna null para ata não extraída', () => {
      expect(getSessao(inserirAta())).toBeNull();
    });
  });

  describe('leituras públicas', () => {
    it('deixam de fora sessão que não passou na conferência', () => {
      const boa = inserirAta();
      const ruim = inserirAta();
      salvarSessao(registro(boa));
      salvarSessao(registro(ruim, { status: 'invalida' }));

      expect(listarSessoes().map((s) => s.documento_id)).toEqual([boa]);
      expect(listarSessoes()[0]).toMatchObject({ presentes: 2, votacoes: 1 });
      expect(listarPresencas()).toHaveLength(3);
      expect(listarVotosNominais().map((v) => v.documento_id)).toEqual([boa]);
      expect(listarIdsDeSessoes()).toEqual([boa, ruim].sort((a, b) => a - b));
    });

    it('listarVotacoes traz placar, votos nominais e a ata de origem', () => {
      salvarSessao(registro(inserirAta()));

      expect(listarVotacoes()[0]).toMatchObject({
        materia: 'Projeto de Lei nº 22/2026',
        votos_contrarios: 2,
        data_sessao: '2026-09-16',
        nominais: [{ nome: 'Luiz Paulo da Silva', voto: 'contrario' }],
        url_origem: 'https://camara.exemplo/m/Legislacao',
      });
    });

    it('contarCobertura compara atas com texto e sessões publicadas', () => {
      const boa = inserirAta();
      inserirAta();
      salvarSessao(registro(boa));

      expect(contarCobertura()).toEqual({
        atas_com_texto: 2,
        sessoes_publicadas: 1,
        ultima_sessao: '2026-09-16',
      });
    });

    it('voto nominal vem com trecho e link da ata', () => {
      salvarSessao(registro(inserirAta()));

      expect(listarVotosNominais()[0]).toMatchObject({
        nome: 'Luiz Paulo da Silva',
        voto: 'contrario',
        trecho: 'dois votos contrários dos vereadores Luiz Paulo e Matheus',
        url_pdf: 'https://camara.exemplo/?Download=1',
      });
    });
  });
});
