'use strict';

const { avaliarSaudePipeline, avaliarCampanhaHistorica, cicloDevido } = require('./pipeline-saude');
const { classifyAiError } = require('./operation-policy');

const AGORA = new Date('2026-09-25T12:00:00Z');
const HORA = 60 * 60 * 1000;

function horasAtras(h) {
  return new Date(AGORA.getTime() - h * HORA).toISOString();
}

describe('PipelineSaude', () => {
  describe('avaliarSaudePipeline', () => {
    const base = {
      agora: AGORA,
      schedulerHabilitado: true,
      ultimoResumoOkEm: horasAtras(2),
      recentes: { total: 10, semResumo: 1 },
    };

    it('ok quando houve resumo recente', () => {
      expect(avaliarSaudePipeline(base)).toEqual({ status: 'ok', motivos: [] });
    });

    it('alerta quando nenhum resumo ok há mais de 24h e há recentes pendentes', () => {
      const r = avaliarSaudePipeline({ ...base, ultimoResumoOkEm: horasAtras(30) });
      expect(r.status).toBe('alerta');
      expect(r.motivos).toContain('sem_resumo_ok_24h');
    });

    it('sem pendentes recentes, resumo antigo não é alerta (nada a fazer)', () => {
      const r = avaliarSaudePipeline({
        ...base,
        ultimoResumoOkEm: horasAtras(72),
        recentes: { total: 5, semResumo: 0 },
      });
      expect(r.status).toBe('ok');
    });

    it('alerta quando nunca houve resumo ok', () => {
      const r = avaliarSaudePipeline({ ...base, ultimoResumoOkEm: null });
      expect(r.motivos).toContain('nunca_resumiu');
    });

    it('alerta quando o scheduler de IA está desabilitado', () => {
      const r = avaliarSaudePipeline({ ...base, schedulerHabilitado: false });
      expect(r.status).toBe('alerta');
      expect(r.motivos).toContain('scheduler_desabilitado');
    });

    it('alerta quando mais da metade dos recentes está sem resumo', () => {
      const r = avaliarSaudePipeline({ ...base, recentes: { total: 14, semResumo: 14 } });
      expect(r.motivos).toContain('maioria_recentes_sem_resumo');
    });
  });

  describe('cicloDevido', () => {
    it('devido quando nunca rodou', () => {
      expect(cicloDevido({ agora: AGORA, ultimoCicloEm: null, intervaloMs: 4 * HORA })).toBe(true);
    });

    it('não devido antes do intervalo', () => {
      expect(cicloDevido({ agora: AGORA, ultimoCicloEm: horasAtras(1), intervaloMs: 4 * HORA })).toBe(false);
    });

    it('devido quando o intervalo passou', () => {
      expect(cicloDevido({ agora: AGORA, ultimoCicloEm: horasAtras(5), intervaloMs: 4 * HORA })).toBe(true);
    });
  });

  describe('classifyAiError (modelo encerrado)', () => {
    it('reconhece modelo em fim de vida / removido', () => {
      expect(classifyAiError('410 Gone: model has reached its end of life')).toBe('modelo_indisponivel');
      expect(classifyAiError('404 model moonshotai/kimi-k3 not found')).toBe('modelo_indisponivel');
    });

    it('mantém as categorias existentes', () => {
      expect(classifyAiError('429 Too Many Requests')).toBe('limite_provider');
      expect(classifyAiError('401 Unauthorized')).toBe('credencial');
      expect(classifyAiError('request timed out')).toBe('timeout');
    });
  });

  describe('classifyAiError (revisão em vez de falha)', () => {
    it('arquivo acima do limite é limite_tamanho', () => {
      expect(classifyAiError('maxContentLength size of 52428800 exceeded')).toBe('limite_tamanho');
    });
    it('fonte ilegível ou alterada aguarda revisão', () => {
      expect(classifyAiError('Texto insuficiente: extracao/OCR exige revisao')).toBe('revisao_fonte');
    });
    it('gates de qualidade do conteudo (OCR ruim, tabela contraditoria) aguardam revisao', () => {
      expect(classifyAiError('texto_baixa_qualidade_ocr')).toBe('revisao_fonte');
      expect(classifyAiError('Itens: ausencia de tabela contradiz as linhas extraidas')).toBe('revisao_fonte');
    });
    it('erro de contrato continua sendo falha real', () => {
      expect(classifyAiError('Too big: expected string to have <=700 characters')).toBe('contrato_invalido');
    });
  });
});

describe('avaliarCampanhaHistorica (força-tarefa de resumos históricos)', () => {
  const base = { agora: AGORA, ativa: true, pendentes: 40, ultimaExecucaoEm: horasAtras(3), errosLimiteProvider: 0 };

  it('campanha desligada nunca alerta', () => {
    expect(avaliarCampanhaHistorica({ ...base, ativa: false, ultimaExecucaoEm: null, errosLimiteProvider: 9 })).toEqual([]);
  });
  it('andando normalmente: sem motivos', () => {
    expect(avaliarCampanhaHistorica(base)).toEqual([]);
  });
  it('429 do provedor nas ultimas 24h alerta', () => {
    expect(avaliarCampanhaHistorica({ ...base, errosLimiteProvider: 1 })).toEqual(['campanha_limite_provider']);
  });
  it('fila pendente e nada executado ha mais de 36h = sem progresso', () => {
    expect(avaliarCampanhaHistorica({ ...base, ultimaExecucaoEm: horasAtras(37) })).toEqual(['campanha_sem_progresso']);
    expect(avaliarCampanhaHistorica({ ...base, ultimaExecucaoEm: null })).toEqual(['campanha_sem_progresso']);
  });
  it('sem pendencias e parada nao e problema (campanha concluida)', () => {
    expect(avaliarCampanhaHistorica({ ...base, pendentes: 0, ultimaExecucaoEm: horasAtras(100) })).toEqual([]);
  });
});
