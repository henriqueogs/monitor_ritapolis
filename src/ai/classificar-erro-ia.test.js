'use strict';
const { classifyAiError } = require('./classificar-erro-ia');

describe('classificar-erro-ia', () => {
  describe('classifyAiError', () => {
    it('separa timeout de limite do provedor', () => {
      expect(classifyAiError('Request timed out after 120000ms')).toBe('timeout');
      expect(classifyAiError('429 Too Many Requests')).toBe('limite_provider');
    });

    it('reconhece modelo aposentado e erro de rede', () => {
      expect(classifyAiError('410 model reached its end of life')).toBe('modelo_indisponivel');
      expect(classifyAiError('fetch failed: ECONNRESET')).toBe('rede');
    });

    it('devolve sem_erro para vazio e outro para o desconhecido', () => {
      expect(classifyAiError('')).toBe('sem_erro');
      expect(classifyAiError('algo inesperado')).toBe('outro');
    });

    it('carrega sem config/.env (o diagnóstico da VM roda fora do app)', () => {
      const fonte = require('fs').readFileSync(require.resolve('./classificar-erro-ia'), 'utf8');
      expect(fonte).not.toMatch(/require\(/);
    });
  });
});
