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

const repo = require('./itens-estruturacao-jobs-repo');

function seedDocumento(id) {
  mockConn
    .prepare(`INSERT INTO documentos (id, fonte, tipo, titulo, url_origem) VALUES (?, 'x', 'edital', 'D', 'u')`)
    .run(id);
}

describe('itens-estruturacao-jobs-repo', () => {
  beforeEach(() => {
    mockConn.exec(
      'DELETE FROM documentos_itens_estruturacao_ai_jobs; DELETE FROM documentos_itens_estruturados; DELETE FROM documentos;'
    );
    seedDocumento(5);
  });

  describe('salvarItensEstruturados (resultado)', () => {
    it('grava e relê itens_json parseado', () => {
      const r = repo.salvarItensEstruturados({
        documento_id: 5,
        provider: 'nvidia',
        modelo: 'nvidia/nemotron-3-nano-30b-a3b',
        contrato_versao: 'itens-processo-v1.0',
        itens_json: { tem_tabela_itens: true, itens_solicitados: [], resultado_lotes: [], resultado_global: null, lacunas: [], confianca: 0.9 },
        texto_hash: 'hash-1',
        confianca: 0.9,
      });
      expect(r.id).toBeDefined();
      const lido = repo.getItensEstruturadosById(r.id);
      expect(lido.itens_json.tem_tabela_itens).toBe(true);
      expect(lido.confianca).toBe(0.9);
    });

    it('é idempotente por (documento_id, texto_hash, contrato_versao) — upsert, não duplica', () => {
      const base = { documento_id: 5, provider: 'nvidia', modelo: 'm', contrato_versao: 'v1', texto_hash: 'h', itens_json: { a: 1 }, confianca: 0.5 };
      const r1 = repo.salvarItensEstruturados(base);
      const r2 = repo.salvarItensEstruturados({ ...base, confianca: 0.8 });
      expect(r2.id).toBe(r1.id);
      const n = mockConn.prepare('SELECT COUNT(*) n FROM documentos_itens_estruturados').get().n;
      expect(n).toBe(1);
      expect(repo.getItensEstruturadosById(r1.id).confianca).toBe(0.8);
    });

    it('getUltimoItensEstruturadosPorDocumento retorna o mais recente com status ok', () => {
      repo.salvarItensEstruturados({ documento_id: 5, provider: 'nvidia', modelo: 'm', contrato_versao: 'v1', texto_hash: 'h1', itens_json: { a: 1 }, confianca: 0.6 });
      const r = repo.getUltimoItensEstruturadosPorDocumento(5);
      expect(r.itens_json.a).toBe(1);
    });

    it('retorna null quando documento não tem resultado', () => {
      expect(repo.getUltimoItensEstruturadosPorDocumento(999)).toBeNull();
    });
  });

  describe('fila de jobs', () => {
    it('cria job pendente e evita duplicar job ativo para mesmo hash+contrato', () => {
      const j1 = repo.createItensEstruturacaoJob({ documento_id: 5, provider: 'nvidia', modelo: 'm', contrato_versao: 'v1', texto_hash: 'h' });
      const j2 = repo.createItensEstruturacaoJob({ documento_id: 5, provider: 'nvidia', modelo: 'm', contrato_versao: 'v1', texto_hash: 'h' });
      expect(j2.id).toBe(j1.id);
    });

    it('getNextPendingItensEstruturacaoJob retorna o mais antigo pendente', () => {
      seedDocumento(6);
      const j1 = repo.createItensEstruturacaoJob({ documento_id: 5, provider: 'nvidia', modelo: 'm', contrato_versao: 'v1', texto_hash: 'h1' });
      repo.createItensEstruturacaoJob({ documento_id: 6, provider: 'nvidia', modelo: 'm', contrato_versao: 'v1', texto_hash: 'h2' });
      const proximo = repo.getNextPendingItensEstruturacaoJob();
      expect(proximo.id).toBe(j1.id);
    });

    it('ciclo completo: processing -> ok', () => {
      const job = repo.createItensEstruturacaoJob({ documento_id: 5, provider: 'nvidia', modelo: 'm', contrato_versao: 'v1', texto_hash: 'h' });
      const marcado = repo.markItensEstruturacaoJobProcessing(job.id);
      expect(marcado.status).toBe('processando');
      expect(marcado.tentativas).toBe(1);

      const resultado = repo.salvarItensEstruturados({ documento_id: 5, provider: 'nvidia', modelo: 'm', contrato_versao: 'v1', texto_hash: 'h', itens_json: {}, confianca: 0.7 });
      const finalizado = repo.finishItensEstruturacaoJobOk(job.id, resultado.id);
      expect(finalizado.status).toBe('ok');
      expect(finalizado.itens_estruturados_id).toBe(resultado.id);
    });

    it('ciclo com erro', () => {
      const job = repo.createItensEstruturacaoJob({ documento_id: 5, provider: 'nvidia', modelo: 'm', contrato_versao: 'v1', texto_hash: 'h' });
      repo.markItensEstruturacaoJobProcessing(job.id);
      const erro = repo.finishItensEstruturacaoJobError(job.id, 'contrato invalido');
      expect(erro.status).toBe('erro');
      expect(erro.erro).toBe('contrato invalido');
    });

    it('recuperação de jobs presos', () => {
      const job = repo.createItensEstruturacaoJob({ documento_id: 5, provider: 'nvidia', modelo: 'm', contrato_versao: 'v1', texto_hash: 'h' });
      repo.markItensEstruturacaoJobProcessing(job.id);
      mockConn.prepare(`UPDATE documentos_itens_estruturacao_ai_jobs SET atualizado_em = '2000-01-01' WHERE id = ?`).run(job.id);

      const r = repo.recoverStaleItensEstruturacaoJobs({ staleMinutes: 30 });
      expect(r.recovered).toBe(1);
      expect(repo.getItensEstruturacaoJobById(job.id).status).toBe('pendente');
    });
  });

  describe('listDocumentosPendentesItens (seleção pro backfill)', () => {
    it('lista só editais com texto_completo', () => {
      mockConn.exec(`UPDATE documentos SET texto_completo = 'edital com texto', tipo='edital' WHERE id = 5`);
      mockConn.prepare(`INSERT INTO documentos (id, fonte, tipo, titulo, url_origem) VALUES (6, 'x', 'decreto', 'D', 'u')`).run();
      mockConn.exec(`UPDATE documentos SET texto_completo = 'decreto com texto' WHERE id = 6`);
      mockConn.prepare(`INSERT INTO documentos (id, fonte, tipo, titulo, url_origem) VALUES (7, 'x', 'edital', 'D', 'u')`).run();

      const r = repo.listDocumentosPendentesItens({ limite: 20 });
      expect(r.map((d) => d.id)).toEqual([5]);
    });

    it('filtra por ano quando informado', () => {
      mockConn.exec(`UPDATE documentos SET texto_completo = 'edital', ano = 2025 WHERE id = 5`);
      mockConn.prepare(`INSERT INTO documentos (id, fonte, tipo, titulo, url_origem, ano) VALUES (6, 'x', 'edital', 'D', 'u', 2020)`).run();
      mockConn.exec(`UPDATE documentos SET texto_completo = 'edital2' WHERE id = 6`);

      const r = repo.listDocumentosPendentesItens({ limite: 20, ano: 2025 });
      expect(r.map((d) => d.id)).toEqual([5]);
    });
  });
});
