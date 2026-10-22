'use strict';

const { buildDocumentSummaryPrompt, buildContractRetryNote } = require('./document-summary-prompt');

describe('DocumentSummaryPrompt', () => {
  describe('buildDocumentSummaryPrompt', () => {
    it('explicita o formato de datas, valores e listas', () => {
      // Act
      const prompt = buildDocumentSummaryPrompt({ texto: 'x', contratoVersao: 'v1' });

      // Assert
      expect(prompt).toContain('AAAA-MM-DD');
      expect(prompt).toMatch(/valor.*numero JSON/i);
      expect(prompt).toMatch(/listas.*\[\]/i);
    });
  });

  describe('buildContractRetryNote', () => {
    it('repete os problemas da resposta anterior', () => {
      // Act
      const nota = buildContractRetryNote(
        'Resumo fora do contrato esperado: valores.0.valor: expected number'
      );

      // Assert
      expect(nota).toContain('fora do contrato');
      expect(nota).toContain('valores.0.valor: expected number');
      expect(nota).toMatch(/somente o JSON/i);
    });

    it('corta mensagem muito longa', () => {
      // Act
      const nota = buildContractRetryNote(`Resumo fora do contrato esperado: ${'x'.repeat(5000)}`);

      // Assert
      expect(nota.length).toBeLessThan(1200);
    });
  });
});
