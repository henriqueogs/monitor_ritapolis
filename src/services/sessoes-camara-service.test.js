'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

function criarBancoMemoria() {
  const conn = new DatabaseSync(':memory:');
  conn.exec('PRAGMA foreign_keys = ON;');
  conn.exec(fs.readFileSync(path.resolve(__dirname, '../db/schema.sql'), 'utf8'));
  return conn;
}

const mockConn = criarBancoMemoria();
jest.mock('../db/connection', () => ({ db: mockConn }));
jest.mock('../logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const { getSessao } = require('../db/camara-sessoes-repo');
const { hashTexto } = require('../ai/extrair-sessao-ata');
const { VERSAO_EXTRATOR } = require('../ai/contracts/sessao-ata-contract');
const { extrairSessoesPendentes, revalidarSessoes } = require('./sessoes-camara-service');

const TEXTO = `Ata da sessão de 16 de setembro de 2026. Presentes os vereadores Luiz Paulo da Silva e Edir Bonifácio Silva
Santos. ${'A sessão transcorreu normalmente. '.repeat(10)} O Projeto de Lei nº 22/2026 foi
aprovado com um voto contrário do vereador Luiz Paulo e um voto favorável do vereador Edir.`;

function inserirAta(texto = TEXTO) {
  return Number(
    mockConn
      .prepare(
        `INSERT INTO documentos (fonte, tipo, titulo, url_origem, texto_completo)
         VALUES ('camara', 'ata_ordinaria', 'Ata', 'https://camara.exemplo/m/Legislacao', ?)`
      )
      .run(texto).lastInsertRowid
  );
}

function resultadoDaIa(texto = TEXTO) {
  return {
    sessao: {
      data_sessao: '2026-09-16',
      presidente: null,
      presentes: ['Luiz Paulo da Silva', 'Edir Bonifácio Silva Santos'],
      ausentes: [],
      votacoes: [
        {
          materia: 'Projeto de Lei nº 22/2026',
          descricao: null,
          resultado: 'aprovado',
          votos_favoraveis: 1,
          votos_contrarios: 1,
          abstencoes: null,
          nominais: [
            { nome: 'Luiz Paulo da Silva', voto: 'contrario' },
            { nome: 'Edir Bonifácio Silva Santos', voto: 'favoravel' },
          ],
          trecho: 'aprovado com um voto contrário do vereador Luiz Paulo e um voto favorável do vereador Edir',
        },
      ],
    },
    avisos: [],
    status: 'ok',
    provider: 'teste',
    modelo: 'modelo-teste',
    texto_hash: hashTexto(texto),
    versao_extrator: VERSAO_EXTRATOR,
  };
}

describe('sessoes-camara-service', () => {
  beforeEach(() => {
    mockConn.exec('DELETE FROM camara_sessoes; DELETE FROM documentos;');
  });

  describe('extrairSessoesPendentes', () => {
    it('extrai e grava cada ata pendente, e não repete o que já está em dia', async () => {
      const id = inserirAta();
      const extrair = jest.fn().mockResolvedValue(resultadoDaIa());

      expect(await extrairSessoesPendentes({ extrair })).toMatchObject({ pendentes: 1, ok: 1 });
      expect(getSessao(id).votacoes).toHaveLength(1);
      expect(await extrairSessoesPendentes({ extrair })).toMatchObject({ pendentes: 0 });
      expect(extrair).toHaveBeenCalledTimes(1);
    });

    it('volta a extrair quando o texto da ata muda', async () => {
      const id = inserirAta();
      const extrair = jest.fn().mockResolvedValue(resultadoDaIa());
      await extrairSessoesPendentes({ extrair });

      mockConn.prepare('UPDATE documentos SET texto_completo = ? WHERE id = ?').run(`${TEXTO} Novo OCR.`, id);

      expect((await extrairSessoesPendentes({ extrair })).pendentes).toBe(1);
    });

    it('respeita o limite e conta falha sem interromper o lote', async () => {
      inserirAta();
      inserirAta();
      inserirAta();
      const extrair = jest
        .fn()
        .mockRejectedValueOnce(new Error('IA fora do ar'))
        .mockResolvedValue(resultadoDaIa());

      const resumo = await extrairSessoesPendentes({ extrair, limite: 2 });

      expect(resumo).toMatchObject({ pendentes: 3, falhas: 1, ok: 1 });
    });
  });

  describe('revalidarSessoes', () => {
    it('não mexe em sessão que continua batendo com a ata', async () => {
      inserirAta();
      await extrairSessoesPendentes({ extrair: jest.fn().mockResolvedValue(resultadoDaIa()) });

      expect(revalidarSessoes()).toEqual({ revalidadas: 1, alteradas: 0 });
    });

    it('tira do ar a votação cujo trecho sumiu do texto e registra o aviso', async () => {
      const id = inserirAta();
      await extrairSessoesPendentes({ extrair: jest.fn().mockResolvedValue(resultadoDaIa()) });
      const semVotacao = TEXTO.replace(/O Projeto de Lei[\s\S]*$/, 'Nada mais a tratar.');
      mockConn.prepare('UPDATE documentos SET texto_completo = ? WHERE id = ?').run(semVotacao, id);

      expect(revalidarSessoes()).toEqual({ revalidadas: 1, alteradas: 1 });

      const sessao = getSessao(id);
      expect(sessao.votacoes).toEqual([]);
      expect(sessao.status_validacao).toBe('com_avisos');
      expect(sessao.avisos[0]).toMatch(/trecho não encontrado/);
    });

    it('mantém o aviso antigo em revalidações seguintes', async () => {
      inserirAta();
      const comAviso = { ...resultadoDaIa(), status: 'com_avisos', avisos: ['voto descartado'] };
      await extrairSessoesPendentes({ extrair: jest.fn().mockResolvedValue(comAviso) });

      expect(revalidarSessoes().alteradas).toBe(0);
    });
  });
});
