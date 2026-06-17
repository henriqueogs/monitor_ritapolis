'use strict';

const { isDocumentoValido, isLegislacaoExterna, isModuloInstitucional } = require('./camara');

describe('ColetorCamara — filtros de coleta', () => {
  describe('isLegislacaoExterna', () => {
    it('rejeita referências a legislação federal', () => {
      expect(isLegislacaoExterna('Lei Federal nº 12.527, de 18 de novembro de 2011')).toBe(true);
      expect(isLegislacaoExterna('Lei Complementar Federal nº 101, de 4 de maio de 2000')).toBe(true);
      expect(isLegislacaoExterna('Decreto Federal nº 7.185, de 27 de maio de 2010')).toBe(true);
    });

    it('rejeita normas de órgãos de controle (TCU/TCE)', () => {
      expect(isLegislacaoExterna('Portaria TCU nº 275, de 14 de dezembro de 2000')).toBe(true);
      expect(isLegislacaoExterna('Instrução Normativa TCU nº 28, de 5 de maio de 1999')).toBe(true);
      expect(isLegislacaoExterna('Resolução TCE nº 12')).toBe(true);
    });

    it('NÃO rejeita normas municipais legítimas da Câmara', () => {
      expect(isLegislacaoExterna('Resolução nº 7, de 18 de agosto de 2015')).toBe(false);
      expect(isLegislacaoExterna('Portaria Legislativa nº 20, de 25 de agosto de 2015')).toBe(false);
      expect(isLegislacaoExterna('Lei Municipal nº 1.658, de 2023')).toBe(false);
      expect(isLegislacaoExterna('EDITAL DE PREGÃO ELETRÔNICO Nº 001/2024')).toBe(false);
    });
  });

  describe('isModuloInstitucional', () => {
    it('reconhece páginas institucionais/de referência (não listam documentos)', () => {
      expect(
        isModuloInstitucional('Acesso à Informação Sobre a Lei de Acesso à Informação Todas as informações')
      ).toBe(true);
      expect(
        isModuloInstitucional('Receitas e Despesas Ordem Cronológica de Pagamentos aos credores')
      ).toBe(true);
    });

    it('NÃO marca módulos reais de documentos como institucionais', () => {
      expect(isModuloInstitucional('Legislação')).toBe(false);
      expect(isModuloInstitucional('Licitações')).toBe(false);
      expect(isModuloInstitucional('Contratos e Aditivos')).toBe(false);
    });
  });

  describe('isDocumentoValido', () => {
    it('rejeita widget seletor de exercício (anos concatenados)', () => {
      expect(
        isDocumentoValido('Exercício - 202620252024202320222021202020192018201720162015', null, null)
      ).toBe(false);
    });

    it('aceita documento real com número e data', () => {
      expect(isDocumentoValido('Resolução nº 7, de 18 de agosto de 2015', '7/2015', '2015-08-18')).toBe(
        true
      );
    });

    it('rejeita rótulo de filtro vazio', () => {
      expect(isDocumentoValido('Situação:', null, null)).toBe(false);
    });

    it('rejeita link de navegação sem identificador', () => {
      expect(isDocumentoValido('Página inicial', null, null)).toBe(false);
    });
  });
});
