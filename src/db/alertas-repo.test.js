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

const repo = require('./alertas-repo');

function seedDocumento(id, dataPub) {
  mockConn
    .prepare(
      `INSERT INTO documentos (id, fonte, tipo, titulo, url_origem, data_publicacao)
       VALUES (?, 'site_prefeitura', 'edital', ?, 'https://x/y', ?)`
    )
    .run(id, `Doc ${id}`, dataPub);
}

describe('alertas-repo', () => {
  beforeEach(() => {
    mockConn.exec('DELETE FROM alertas_documentos; DELETE FROM alertas; DELETE FROM alertas_watermark; DELETE FROM alertas_config; DELETE FROM documentos;');
  });

  describe('upsertAlerta', () => {
    it('insere e relê com JSON parseado', () => {
      seedDocumento(1, '2026-03-01');
      const { id, action } = repo.upsertAlerta(
        {
          tipo: 'tematico',
          categoria: 'Meio ambiente',
          severidade: 'atencao',
          titulo: 'Cortes de árvores em 2026',
          narrativa: 'Vários processos de poda/corte.',
          metadados: { count: 3 },
          documentos_ids: [1],
          questionamentos: ['Há projeto?'],
          confianca: 0.8,
          chave_unica: 'tematico|meio-ambiente|2026',
          ultima_publicacao_documento: '2026-03-01',
        },
        [{ documento_id: 1, papel: 'origem', trecho_fonte: 'corte' }]
      );
      expect(action).toBe('inserted');
      const a = repo.getAlerta(id);
      expect(a.titulo).toBe('Cortes de árvores em 2026');
      expect(a.metadados).toEqual({ count: 3 });
      expect(a.questionamentos).toEqual(['Há projeto?']);
      expect(a.documentos).toHaveLength(1);
      expect(a.documentos[0].documento_id).toBe(1);
    });

    it('é idempotente por chave_unica (atualiza, não duplica)', () => {
      const base = { tipo: 'tematico', titulo: 'A', chave_unica: 'k1', severidade: 'info' };
      const r1 = repo.upsertAlerta(base, []);
      const r2 = repo.upsertAlerta({ ...base, titulo: 'A atualizado' }, []);
      expect(r1.id).toBe(r2.id);
      expect(r2.action).toBe('updated');
      expect(repo.listarAlertas().total).toBe(1);
      expect(repo.getAlerta(r1.id).titulo).toBe('A atualizado');
    });

    it('não reativa alerta arquivado pelo humano ao regenerar', () => {
      const base = { tipo: 'tematico', titulo: 'A', chave_unica: 'k2', severidade: 'info' };
      const { id } = repo.upsertAlerta(base, []);
      repo.setAlertaStatus(id, 'arquivado');
      repo.upsertAlerta({ ...base, titulo: 'regenerado', status: 'ativo' }, []);
      expect(repo.getAlerta(id).status).toBe('arquivado');
    });
  });

  describe('listarAlertas / destaques', () => {
    beforeEach(() => {
      repo.upsertAlerta({ tipo: 'tematico', titulo: 'Crítico recente', chave_unica: 'c1', severidade: 'critico', ultima_publicacao_documento: '2026-05-01' }, []);
      repo.upsertAlerta({ tipo: 'tematico', titulo: 'Info antigo', chave_unica: 'c2', severidade: 'info', ultima_publicacao_documento: '2026-01-01' }, []);
      repo.upsertAlerta({ tipo: 'processo', titulo: 'Atenção', chave_unica: 'c3', severidade: 'atencao', ultima_publicacao_documento: '2026-04-01' }, []);
    });

    it('ordena por data de publicação desc e filtra por severidade', () => {
      const todos = repo.listarAlertas();
      expect(todos.total).toBe(3);
      expect(todos.dados[0].titulo).toBe('Crítico recente');
      expect(repo.listarAlertas({ severidade: 'atencao' }).total).toBe(1);
    });

    it('destaques priorizam severidade depois recência', () => {
      const d = repo.listarDestaques(3);
      expect(d[0].severidade).toBe('critico');
      expect(d[1].severidade).toBe('atencao');
    });

    it('contarPorSeveridade agrega ativos', () => {
      expect(repo.contarPorSeveridade()).toEqual({ critico: 1, atencao: 1, info: 1, total: 3 });
    });
  });

  describe('watermark', () => {
    it('cria e acumula total_gerados', () => {
      repo.setWatermark('ciclo', { ultimoProcessadoEm: '2026-06-01T00:00:00Z', totalGerados: 2 });
      repo.setWatermark('ciclo', { ultimoProcessadoEm: '2026-06-02T00:00:00Z', totalGerados: 3 });
      const w = repo.getWatermark('ciclo');
      expect(w.ultimo_processado_em).toBe('2026-06-02T00:00:00Z');
      expect(w.total_gerados).toBe(5);
    });
  });

  describe('config', () => {
    it('grava e lê valores JSON tipados', () => {
      repo.setConfig('min_repeticao', 3, 'Mínimo de docs por tema');
      repo.setConfig('gatilhos', { risco: true, valor: false });
      expect(repo.getConfig('min_repeticao')).toBe(3);
      expect(repo.getConfig('gatilhos')).toEqual({ risco: true, valor: false });
      expect(repo.getConfig('inexistente', 'fb')).toBe('fb');
      expect(repo.getAllConfig()).toHaveLength(2);
    });
  });
});
