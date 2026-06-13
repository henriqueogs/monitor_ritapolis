'use strict';

const { classificarCategoria, CATEGORIAS } = require('./categoria');

const cls = (titulo, objeto = '', produtos = []) =>
  classificarCategoria({ titulo, objeto, produtos }).categoria;

describe('licitacoes/categoria · classificarCategoria', () => {
  describe('categorias existentes continuam funcionando', () => {
    it('Alimentação', () => {
      expect(cls('Chamada Pública - Aquisição de gêneros alimentícios da agricultura familiar')).toBe(
        'Alimentação'
      );
    });
    it('Saúde', () => {
      expect(cls('Pregão - Aquisição de medicamentos para a farmácia básica')).toBe('Saúde');
    });
    it('Obras e Infraestrutura', () => {
      expect(cls('Tomada de Preços - Pavimentação asfáltica de vias urbanas')).toBe(
        'Obras e Infraestrutura'
      );
    });
    it('Equipamentos e Materiais', () => {
      expect(cls('Pregão - Aquisição de veículo 0 km para a secretaria')).toBe(
        'Equipamentos e Materiais'
      );
    });
  });

  describe('nova categoria Cultura e Eventos (resíduo de "Outros")', () => {
    it('contratação de banda', () => {
      expect(cls('Inexigibilidade nº 087/2025 - Contratação da Banda Araketu')).toBe(
        'Cultura e Eventos'
      );
    });
    it('contratação de cantor', () => {
      expect(cls('Inexigibilidade - Contratação do cantor Gabriel Gava para a festa da cidade')).toBe(
        'Cultura e Eventos'
      );
    });
    it('dupla sertaneja', () => {
      expect(cls('Inexigibilidade - Contratação da Dupla Sertaneja Gian e Giovani')).toBe(
        'Cultura e Eventos'
      );
    });
    it('cia de rodeio', () => {
      expect(cls('Inexigibilidade - Contratação da Cia de Rodeio para a 41ª Exposição')).toBe(
        'Cultura e Eventos'
      );
    });
    it('entretenimento infantil natalino', () => {
      expect(cls('Dispensa - Entretenimento Infantil Natalino durante as festividades')).toBe(
        'Cultura e Eventos'
      );
    });
  });

  describe('credenciamento cai em Serviços (não mais Outros)', () => {
    it('credenciamento de instituição financeira', () => {
      expect(cls('Credenciamento nº 005/2025 - Credenciamento de Instituição Financeira')).toBe(
        'Serviços'
      );
    });
    it('credenciamento de oficineiros', () => {
      expect(cls('Chamamento - Credenciamento de Oficineiros para o CRAS')).toBe('Serviços');
    });
  });

  describe('sem sinal → Outros', () => {
    it('texto genérico', () => {
      expect(cls('Processo administrativo interno sem objeto identificável')).toBe('Outros');
    });
  });

  it('expõe a lista de categorias incluindo a nova', () => {
    expect(CATEGORIAS).toContain('Cultura e Eventos');
    expect(CATEGORIAS).toContain('Saúde');
  });

  it('retorna estrutura com confianca e keywords', () => {
    const r = classificarCategoria({ titulo: 'Contratação da Banda Malta', objeto: '', produtos: [] });
    expect(r).toHaveProperty('confianca');
    expect(r).toHaveProperty('keywords_matched');
    expect(Array.isArray(r.keywords_matched)).toBe(true);
  });
});
