'use strict';

jest.mock('../db/pipeline-saude-repo', () => ({
  getUltimoResumoOk: jest.fn(),
  getUltimoErroResumo: jest.fn(),
  contarRecentesSemResumo: jest.fn(),
}));
jest.mock('../ai/ai-daily-scheduler', () => ({ getStatus: jest.fn() }));

const repo = require('../db/pipeline-saude-repo');
const scheduler = require('../ai/ai-daily-scheduler');
const { getSaudePipeline } = require('./pipeline-saude-service');

const AGORA = new Date('2026-09-25T12:00:00Z');

describe('pipeline-saude-service', () => {
  beforeEach(() => {
    repo.getUltimoResumoOk.mockReturnValue({ em: '2026-08-27 09:00:00', provider: 'nvidia', modelo: 'm' });
    repo.getUltimoErroResumo.mockReturnValue({ em: '2026-09-24 08:00:00', erro: '410 Gone: end of life (key=abc)' });
    repo.contarRecentesSemResumo.mockReturnValue({ total: 14, semResumo: 14, semTexto: 2, maisAntigoSemResumo: '2026-08-31' });
    scheduler.getStatus.mockReturnValue({ enabled: true, ultimo_ciclo: '2026-09-25T08:00:00Z', ultimo_resultado: { total_ok: 0, total_erro: 30 } });
  });

  it('monta payload com alerta, janela de 30 dias e categoria do erro', () => {
    const s = getSaudePipeline({ agora: AGORA });

    expect(repo.contarRecentesSemResumo).toHaveBeenCalledWith({ desde: '2026-08-26' });
    expect(s.status).toBe('alerta');
    expect(s.motivos).toEqual(expect.arrayContaining(['sem_resumo_ok_24h', 'maioria_recentes_sem_resumo']));
    expect(s.ia.ultimo_erro).toEqual({ em: '2026-09-24 08:00:00', categoria: 'modelo_indisponivel' });
    expect(s.documentos_recentes).toMatchObject({ janela_dias: 30, total_com_texto: 14, sem_resumo: 14 });
    expect(s.ia.scheduler.ultimo_ciclo).toBe('2026-09-25T08:00:00Z');
  });

  it('nunca expõe o texto cru do erro', () => {
    expect(JSON.stringify(getSaudePipeline({ agora: AGORA }))).not.toContain('key=abc');
  });
});
