'use strict';

jest.mock('../db/pipeline-saude-repo', () => ({
  getUltimoResumoOk: jest.fn(),
  getUltimoErroResumo: jest.fn(),
  contarRecentesSemResumo: jest.fn(),
  getCampanhaHistorica: jest.fn(),
}));
jest.mock('../ai/ai-daily-scheduler', () => ({ getStatus: jest.fn() }));
jest.mock('../pipeline/coordinator', () => ({ enabled: jest.fn(() => false), status: jest.fn() }));

const repo = require('../db/pipeline-saude-repo');
const scheduler = require('../ai/ai-daily-scheduler');
const { getSaudePipeline } = require('./pipeline-saude-service');

const AGORA = new Date('2026-09-25T12:00:00Z');

describe('pipeline-saude-service', () => {
  beforeEach(() => {
    repo.getUltimoResumoOk.mockReturnValue({
      em: '2026-08-27 09:00:00',
      provider: 'nvidia',
      modelo: 'm',
    });
    repo.getUltimoErroResumo.mockReturnValue({
      em: '2026-09-24 08:00:00',
      erro: '410 Gone: end of life (key=abc)',
    });
    repo.contarRecentesSemResumo.mockReturnValue({
      total: 14,
      semResumo: 14,
      semTexto: 2,
      maisAntigoSemResumo: '2026-08-31',
    });
    scheduler.getStatus.mockReturnValue({
      enabled: true,
      ultimo_ciclo: '2026-09-25T08:00:00Z',
      ultimo_resultado: { total_ok: 0, total_erro: 30 },
    });
    require('../pipeline/coordinator').enabled.mockReturnValue(false);
  });

  it('monta payload com alerta, janela de 30 dias e categoria do erro', () => {
    const s = getSaudePipeline({ agora: AGORA });

    expect(repo.contarRecentesSemResumo).toHaveBeenCalledWith({ desde: '2026-08-26' });
    expect(s.status).toBe('alerta');
    expect(s.motivos).toEqual(
      expect.arrayContaining(['sem_resumo_ok_24h', 'maioria_recentes_sem_resumo'])
    );
    expect(s.ia.ultimo_erro).toEqual({
      em: '2026-09-24 08:00:00',
      categoria: 'modelo_indisponivel',
    });
    expect(s.documentos_recentes).toMatchObject({
      janela_dias: 30,
      total_com_texto: 14,
      sem_resumo: 14,
    });
    expect(s.ia.scheduler.ultimo_ciclo).toBe('2026-09-25T08:00:00Z');
  });

  it('nunca expõe o texto cru do erro', () => {
    expect(JSON.stringify(getSaudePipeline({ agora: AGORA }))).not.toContain('key=abc');
  });
  it('historical backlog alone is not an overdue recent queue, but fresh work stalled 24h is', () => {
    const pipeline = require('../pipeline/coordinator');
    pipeline.enabled.mockReturnValue(true);
    const state = {
      counts: [],
      active: null,
      failures: [],
      safety: { paused: false },
      oldest_pending: '2026-09-01T00:00:00Z',
      oldest_pending_recent: null,
    };
    pipeline.status.mockReturnValue(state);
    repo.getUltimoResumoOk.mockReturnValue({ em: AGORA.toISOString() });
    repo.contarRecentesSemResumo.mockReturnValue({ total: 9, semResumo: 0, semTexto: 0 });
    expect(getSaudePipeline({ agora: AGORA }).motivos).not.toContain('fila_pendente_24h');
    state.oldest_pending_recent = '2026-09-01T00:00:00Z';
    expect(getSaudePipeline({ agora: AGORA }).motivos).toContain('fila_pendente_24h');
  });
  it('falhas atuais e pausa de seguranca impedem falso ok sem expor erro cru', () => {
    const pipeline = require('../pipeline/coordinator');
    pipeline.enabled.mockReturnValue(true);
    pipeline.status.mockReturnValue({
      active: null,
      counts: [],
      oldest_pending: null,
      safety: { paused: true, reason: 'r2_guard_stale' },
      failures: [{ id: 1, kind: 'extract', error: 'worker_interrupted secret=abc' }],
    });
    repo.contarRecentesSemResumo.mockReturnValue({ total: 9, semResumo: 0, semTexto: 4 });
    const result = getSaudePipeline({ agora: AGORA });
    expect(result.status).toBe('alerta');
    expect(result.motivos).toEqual(
      expect.arrayContaining(['tarefas_atuais_com_falha', 'escritas_pausadas:r2_guard_stale'])
    );
    expect(JSON.stringify(result)).not.toContain('secret=abc');
  });
  it('file-limit and source-review failures await review; genuine failures still alert', () => {
    const pipeline = require('../pipeline/coordinator');
    pipeline.enabled.mockReturnValue(true);
    const state = {
      active: null,
      counts: [],
      oldest_pending: null,
      oldest_pending_recent: null,
      safety: { paused: false },
      failures: [
        { id: 1, kind: 'extract', error: 'maxContentLength size of 52428800 exceeded' },
        { id: 2, kind: 'extract', error: 'Texto insuficiente: extracao/OCR exige revisao' },
      ],
    };
    pipeline.status.mockReturnValue(state);
    repo.getUltimoResumoOk.mockReturnValue({ em: AGORA.toISOString() });
    repo.contarRecentesSemResumo.mockReturnValue({ total: 9, semResumo: 0, semTexto: 0 });
    let result = getSaudePipeline({ agora: AGORA });
    expect(result.motivos).not.toContain('tarefas_atuais_com_falha');
    expect(result.avisos).toContain('documentos_aguardando_revisao');
    expect(result.status).toBe('ok');
    expect(result.pipeline.aguardando_revisao).toBe(2);
    expect(result.pipeline.falhas_reais).toBe(0);
    state.failures.push({ id: 3, kind: 'items', error: 'too_big trecho_fonte invalid' });
    result = getSaudePipeline({ agora: AGORA });
    expect(result.status).toBe('alerta');
    expect(result.motivos).toContain('tarefas_atuais_com_falha');
    expect(result.pipeline.falhas_reais).toBe(1);
  });
  it('saida da IA rejeitada pelo contrato estrito aguarda revisao e nao alerta', () => {
    const pipeline = require('../pipeline/coordinator');
    pipeline.enabled.mockReturnValue(true);
    const issues = JSON.stringify([
      { expected: 'string', code: 'invalid_type', path: ['resultado_global', 'descricao'], message: 'Invalid input: expected string, received null' },
    ]);
    pipeline.status.mockReturnValue({
      active: null,
      counts: [],
      oldest_pending: null,
      oldest_pending_recent: null,
      safety: { paused: false },
      failures: [{ id: 4, kind: 'items', error: issues }],
    });
    repo.getUltimoResumoOk.mockReturnValue({ em: AGORA.toISOString() });
    repo.contarRecentesSemResumo.mockReturnValue({ total: 9, semResumo: 0, semTexto: 0 });
    const result = getSaudePipeline({ agora: AGORA });
    expect(result.motivos).not.toContain('tarefas_atuais_com_falha');
    expect(result.avisos).toContain('documentos_aguardando_revisao');
    expect(result.pipeline.falhas_reais).toBe(0);
    expect(result.pipeline.aguardando_revisao).toBe(1);
  });
});

describe('pipeline-saude-service: campanha historica', () => {
  const config = require('../config');
  const original = config.pipelineHistoricalDocsPerDay;
  beforeEach(() => {
    repo.getUltimoResumoOk.mockReturnValue({ em: AGORA.toISOString() });
    repo.getUltimoErroResumo.mockReturnValue(null);
    repo.contarRecentesSemResumo.mockReturnValue({ total: 9, semResumo: 0, semTexto: 0 });
    scheduler.getStatus.mockReturnValue({ enabled: true });
    require('../pipeline/coordinator').enabled.mockReturnValue(false);
  });
  afterEach(() => { config.pipelineHistoricalDocsPerDay = original; });

  it('com limite padrao nao consulta nem expoe campanha', () => {
    const s = getSaudePipeline({ agora: AGORA });
    expect(s.campanha).toBeUndefined();
    expect(repo.getCampanhaHistorica).not.toHaveBeenCalled();
  });
  it('limite elevado expoe progresso e alerta em 429 sem expor o erro cru', () => {
    config.pipelineHistoricalDocsPerDay = 50;
    repo.getCampanhaHistorica.mockReturnValue({
      docsUltimas24h: 12, pendentes: 30, semResumoComTexto: 200,
      ultimaExecucaoEm: '2026-09-25T10:00:00Z', errosRecentes: ['429 rate limit key=abc', 'timeout'],
    });
    const s = getSaudePipeline({ agora: AGORA });
    expect(s.campanha).toMatchObject({
      ativa: true, limite_docs_dia: 50, docs_24h: 12, pendentes: 30,
      sem_resumo_com_texto: 200, erros_limite_provider_24h: 1,
    });
    expect(s.motivos).toContain('campanha_limite_provider');
    expect(s.status).toBe('alerta');
    expect(JSON.stringify(s)).not.toContain('key=abc');
  });
});
