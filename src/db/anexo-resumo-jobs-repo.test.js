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

const repo = require('./anexo-resumo-jobs-repo');

function seedAnexo(id) {
  mockConn
    .prepare(
      `INSERT INTO documentos (id, fonte, tipo, titulo, url_origem)
       VALUES (?, 'site_prefeitura', 'edital', 'Doc', 'https://x/y')`
    )
    .run(id * 1000);
  mockConn
    .prepare(
      `INSERT INTO documentos_anexos (id, documento_id, nome, url, tipo)
       VALUES (?, ?, 'anexo.pdf', 'https://x/anexo.pdf', 'ata')`
    )
    .run(id, id * 1000);
}

describe('anexo-resumo-jobs-repo', () => {
  beforeEach(() => {
    mockConn.exec(
      'DELETE FROM documentos_anexos_resumos_ai_jobs; DELETE FROM documentos_anexos_resumos_ai; DELETE FROM documentos_anexos; DELETE FROM documentos;'
    );
  });

  describe('createAnexoResumoJob', () => {
    it('cria job pendente', () => {
      seedAnexo(1);
      const job = repo.createAnexoResumoJob({
        anexo_id: 1,
        provider: 'nvidia',
        modelo: 'x',
        contrato_versao: 'anexo-2.0',
        texto_hash: 'hash1',
      });
      expect(job.status).toBe('pendente');
      expect(job.anexo_id).toBe(1);
      expect(job.tentativas).toBe(0);
    });

    it('nao duplica job pendente/processando para o mesmo anexo+hash+contrato', () => {
      seedAnexo(1);
      const args = { anexo_id: 1, provider: 'nvidia', modelo: 'x', contrato_versao: 'anexo-2.0', texto_hash: 'hash1' };
      const j1 = repo.createAnexoResumoJob(args);
      const j2 = repo.createAnexoResumoJob(args);
      expect(j2.id).toBe(j1.id);
    });

    it('permite novo job se o anterior ja terminou (ok/erro)', () => {
      seedAnexo(1);
      const args = { anexo_id: 1, provider: 'nvidia', modelo: 'x', contrato_versao: 'anexo-2.0', texto_hash: 'hash1' };
      const j1 = repo.createAnexoResumoJob(args);
      repo.markAnexoResumoJobProcessing(j1.id);
      repo.finishAnexoResumoJobError(j1.id, 'falhou');
      const j2 = repo.createAnexoResumoJob(args);
      expect(j2.id).not.toBe(j1.id);
    });
  });

  describe('fila de processamento', () => {
    it('getNextPendingAnexoResumoJob retorna o mais antigo pendente', () => {
      seedAnexo(1);
      seedAnexo(2);
      const jA = repo.createAnexoResumoJob({ anexo_id: 1, provider: 'p', modelo: 'm', contrato_versao: 'v', texto_hash: 'a' });
      repo.createAnexoResumoJob({ anexo_id: 2, provider: 'p', modelo: 'm', contrato_versao: 'v', texto_hash: 'b' });
      const proximo = repo.getNextPendingAnexoResumoJob();
      expect(proximo.id).toBe(jA.id);
    });

    it('markAnexoResumoJobProcessing so avanca job pendente', () => {
      seedAnexo(1);
      const job = repo.createAnexoResumoJob({ anexo_id: 1, provider: 'p', modelo: 'm', contrato_versao: 'v', texto_hash: 'a' });
      const locked = repo.markAnexoResumoJobProcessing(job.id);
      expect(locked.status).toBe('processando');
      expect(locked.tentativas).toBe(1);

      // segunda chamada nao reprocessa (ja nao esta mais pendente)
      const relocked = repo.markAnexoResumoJobProcessing(job.id);
      expect(relocked.status).toBe('processando');
      expect(relocked.tentativas).toBe(1);
    });

    it('finishAnexoResumoJobOk marca ok e associa o resumo salvo', () => {
      seedAnexo(1);
      const job = repo.createAnexoResumoJob({ anexo_id: 1, provider: 'p', modelo: 'm', contrato_versao: 'v', texto_hash: 'a' });
      repo.markAnexoResumoJobProcessing(job.id);
      const resumo = mockConn
        .prepare(
          `INSERT INTO documentos_anexos_resumos_ai (anexo_id, provider, modelo, contrato_versao, resumo_json, texto_hash)
           VALUES (1, 'p', 'm', 'v', '{}', 'a')`
        )
        .run();
      repo.finishAnexoResumoJobOk(job.id, Number(resumo.lastInsertRowid));
      const atualizado = repo.getAnexoResumoJobById(job.id);
      expect(atualizado.status).toBe('ok');
      expect(atualizado.resumo_ai_id).toBe(Number(resumo.lastInsertRowid));
      expect(atualizado.finalizado_em).toBeTruthy();
    });

    it('finishAnexoResumoJobError marca erro com mensagem', () => {
      seedAnexo(1);
      const job = repo.createAnexoResumoJob({ anexo_id: 1, provider: 'p', modelo: 'm', contrato_versao: 'v', texto_hash: 'a' });
      repo.markAnexoResumoJobProcessing(job.id);
      repo.finishAnexoResumoJobError(job.id, 'timeout');
      const atualizado = repo.getAnexoResumoJobById(job.id);
      expect(atualizado.status).toBe('erro');
      expect(atualizado.erro).toBe('timeout');
    });
  });

  describe('recoverStaleAnexoResumoJobs', () => {
    it('devolve jobs travados em processando ha muito tempo para pendente', () => {
      seedAnexo(1);
      const job = repo.createAnexoResumoJob({ anexo_id: 1, provider: 'p', modelo: 'm', contrato_versao: 'v', texto_hash: 'a' });
      repo.markAnexoResumoJobProcessing(job.id);
      mockConn
        .prepare("UPDATE documentos_anexos_resumos_ai_jobs SET atualizado_em = '2000-01-01T00:00:00.000Z' WHERE id = ?")
        .run(job.id);

      const resultado = repo.recoverStaleAnexoResumoJobs({ staleMinutes: 30 });
      expect(resultado.recovered).toBe(1);
      expect(repo.getAnexoResumoJobById(job.id).status).toBe('pendente');
    });

    it('nao mexe em jobs recentes', () => {
      seedAnexo(1);
      const job = repo.createAnexoResumoJob({ anexo_id: 1, provider: 'p', modelo: 'm', contrato_versao: 'v', texto_hash: 'a' });
      repo.markAnexoResumoJobProcessing(job.id);
      const resultado = repo.recoverStaleAnexoResumoJobs({ staleMinutes: 30 });
      expect(resultado.recovered).toBe(0);
      expect(repo.getAnexoResumoJobById(job.id).status).toBe('processando');
    });
  });

  describe('listAnexoResumoJobs', () => {
    it('lista com filtro de status', () => {
      seedAnexo(1);
      repo.createAnexoResumoJob({ anexo_id: 1, provider: 'p', modelo: 'm', contrato_versao: 'v', texto_hash: 'a' });
      const pendentes = repo.listAnexoResumoJobs({ status: 'pendente' });
      expect(pendentes).toHaveLength(1);
      const ok = repo.listAnexoResumoJobs({ status: 'ok' });
      expect(ok).toHaveLength(0);
    });
  });
});
