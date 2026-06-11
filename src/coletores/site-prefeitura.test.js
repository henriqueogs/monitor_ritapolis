'use strict';

const { inferTipo } = require('./site-prefeitura');

describe('site-prefeitura · inferTipo', () => {
  describe('modalidades de contratação já suportadas', () => {
    it('classifica pregão como edital', () => {
      expect(inferTipo('Pregão Eletrônico nº 001/2024')).toBe('edital');
    });

    it('classifica dispensa como edital', () => {
      expect(inferTipo('Dispensa nº 005/2026 - Contratação de fanfarra')).toBe('edital');
    });

    it('classifica inexigibilidade como edital', () => {
      expect(inferTipo('Inexigibilidade nº 008/2026')).toBe('edital');
    });
  });

  describe('modalidades de contratação que faltavam (regressão dos 58 documento_publico)', () => {
    it('classifica chamamento público como edital', () => {
      expect(inferTipo('Chamamento 001/2025 - Credenciamento de Oficineiros')).toBe('edital');
    });

    it('classifica chamada pública como edital', () => {
      expect(inferTipo('Chamada Pública nº 01/2022 - Aquisição de gêneros da Agricultura Familiar')).toBe(
        'edital'
      );
    });

    it('classifica credenciamento como edital', () => {
      expect(inferTipo('Credenciamento nº 005/2025 - Instituição Financeira')).toBe('edital');
    });

    it('classifica concorrência pública como edital', () => {
      expect(inferTipo('Concorrência Pública nº 01/2022 - Contratação de empresa')).toBe('edital');
    });

    it('classifica leilão como edital', () => {
      expect(inferTipo('LEILÃO 003/2025 - Venda de veículos e sucatas')).toBe('edital');
    });

    it('classifica tomada de preços como edital', () => {
      expect(inferTipo('Tomada de Preços nº 002/2023')).toBe('edital');
    });

    it('classifica concessão de espaço público como edital', () => {
      expect(inferTipo('Concessão de Espaço Público - Exposição Agropecuária 2025')).toBe('edital');
    });

    it('tolera o erro de digitação "Inexibilidade"', () => {
      expect(inferTipo('Inexibilidade n° 008/2026 - Contratação de empresa')).toBe('edital');
    });
  });

  describe('não-licitações permanecem documento_publico', () => {
    it('convocação de conselheira tutelar não é edital', () => {
      expect(inferTipo('CONVOCAÇÃO DE CONSELHEIRA TUTELAR SUPLENTE nº 04/2025')).toBe(
        'documento_publico'
      );
    });

    it('permanência de conselheira tutelar não é edital', () => {
      expect(inferTipo('PERMANÊNCIA DE CONSELHEIRA TUTELAR SUPLENTE nº 001')).toBe(
        'documento_publico'
      );
    });
  });

  describe('outros tipos continuam corretos', () => {
    it('decreto', () => {
      expect(inferTipo('Decreto nº 1.234/2024')).toBe('decreto');
    });

    it('portaria', () => {
      expect(inferTipo('Portaria nº 045/2024')).toBe('portaria');
    });

    it('lei no título', () => {
      expect(inferTipo('Lei nº 001/2024')).toBe('lei');
    });
  });
});
