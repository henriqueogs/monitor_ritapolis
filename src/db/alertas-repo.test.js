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
    mockConn.exec('DELETE FROM alertas_evidencias; DELETE FROM alertas_documentos; DELETE FROM alertas; DELETE FROM alertas_watermark; DELETE FROM alertas_config; DELETE FROM inteligencia_fatos; DELETE FROM documentos_anexos; DELETE FROM documentos;');
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

  describe('removerAtivosNaoListados', () => {
    it('remove ativos fora da lista, preserva os listados e os arquivados', () => {
      const r1 = repo.upsertAlerta({ tipo: 'tematico', titulo: 'Mantém', chave_unica: 'keep', severidade: 'info' }, []);
      repo.upsertAlerta({ tipo: 'tematico', titulo: 'Some', chave_unica: 'drop', severidade: 'info' }, []);
      const arq = repo.upsertAlerta({ tipo: 'tematico', titulo: 'Arquivado', chave_unica: 'arch', severidade: 'info' }, []);
      repo.setAlertaStatus(arq.id, 'arquivado');

      const removidos = repo.removerAtivosNaoListados(['keep']);

      expect(removidos).toBe(1);
      expect(repo.getAlerta(r1.id)).not.toBeNull();
      // arquivado pelo humano não é tocado, mesmo fora da lista
      expect(repo.getAlerta(arq.id).status).toBe('arquivado');
      const ativos = repo.listarAlertas({ status: 'ativo' });
      expect(ativos.dados.map((a) => a.chave_unica).sort()).toEqual(['keep']);
    });

    it('sem chaves não remove nada (proteção contra zerar o feed)', () => {
      repo.upsertAlerta({ tipo: 'tematico', titulo: 'A', chave_unica: 'k', severidade: 'info' }, []);
      expect(repo.removerAtivosNaoListados([])).toBe(0);
      expect(repo.listarAlertas({ status: 'ativo' }).total).toBe(1);
    });

    it('remove também os vínculos de documentos do alerta removido', () => {
      seedDocumento(1, '2026-03-01');
      const drop = repo.upsertAlerta(
        { tipo: 'tematico', titulo: 'Some', chave_unica: 'drop', severidade: 'info', documentos_ids: [1] },
        [{ documento_id: 1, papel: 'origem' }]
      );
      repo.upsertAlerta({ tipo: 'tematico', titulo: 'Mantém', chave_unica: 'keep', severidade: 'info' }, []);

      repo.removerAtivosNaoListados(['keep']);

      const vinculos = mockConn
        .prepare('SELECT COUNT(*) AS n FROM alertas_documentos WHERE alerta_id = ?')
        .get(drop.id).n;
      expect(vinculos).toBe(0);
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

  describe('payload publico', () => {
    it('remove campos administrativos de descobertas e evidencias', () => {
      seedDocumento(1, '2026-03-01');
      const { id } = repo.upsertAlerta(
        {
          tipo: 'tematico',
          categoria: 'Meio ambiente',
          severidade: 'atencao',
          titulo: 'Sinal publico',
          narrativa: 'Resumo publico.',
          metadados: {
            unidade: 'R$',
            segredo: 'interno',
            discovery_v2: {
              tipo_investigacao: 'meio_ambiente.supressao_arvores',
              narrativa_consolidada: 'Narrativa publica.',
              lacunas_encontradas: ['Laudo nao apareceu.'],
              metricas: { total: 2 },
              analise_admin: 'Texto interno incisivo.',
              status: 'fallback',
              provider: 'nvidia',
              modelo: 'modelo-interno',
              erro: 'timeout',
              payload_json: { raw: true },
            },
          },
          documentos_ids: [1],
          chave_unica: 'tematico|meio-ambiente|2026',
        },
        [{ documento_id: 1, papel: 'origem', trecho_fonte: 'trecho bruto' }],
        [{
          documento_id: 1,
          papel: 'evidencia',
          trecho_fonte: 'trecho publico',
          metadados: {
            valor: 100,
            portal_url: 'https://portal.example',
            segredo: 'nao expor',
          },
        }]
      );

      const publico = repo.getAlertaPublico(id);

      expect(publico.chave_unica).toBeUndefined();
      expect(publico.metadados_json).toBeUndefined();
      expect(publico.metadados.segredo).toBeUndefined();
      expect(publico.metadados.discovery_v2.narrativa_consolidada).toBe('Narrativa publica.');
      expect(publico.metadados.discovery_v2.analise_admin).toBeUndefined();
      expect(publico.metadados.discovery_v2.status).toBeUndefined();
      expect(publico.metadados.discovery_v2.provider).toBeUndefined();
      expect(publico.metadados.discovery_v2.modelo).toBeUndefined();
      expect(publico.metadados.discovery_v2.erro).toBeUndefined();
      expect(publico.documentos[0].trecho_fonte).toBeUndefined();
      expect(publico.evidencias[0].metadados).toEqual({
        valor: 100,
        portal_url: 'https://portal.example',
      });
    });

    it('nao expõe alertas arquivados no payload publico', () => {
      const { id } = repo.upsertAlerta({ tipo: 'tematico', titulo: 'Arquivar', chave_unica: 'pub-archive', severidade: 'info' }, []);
      repo.setAlertaStatus(id, 'arquivado');

      expect(repo.getAlertaPublico(id)).toBeNull();
      expect(repo.listarAlertasPublicos({ status: 'arquivado' }).total).toBe(0);
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
