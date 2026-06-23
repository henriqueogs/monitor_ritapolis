'use strict';

const { parseLicitacao } = require('./licitacao');

describe('parseLicitacao', () => {
  describe('modalidade', () => {
    it('extrai "pregão eletrônico"', () => {
      const { modalidade } = parseLicitacao('Pregão Eletrônico n° 001/2024');
      expect(modalidade).toMatch(/preg[aã]o/i);
    });

    it('extrai "dispensa" (preserva casing original do documento)', () => {
      const { modalidade } = parseLicitacao('Dispensa de Licitação n° 005/2024');
      expect(modalidade).toMatch(/dispensa/i);
    });

    it('retorna null quando não encontra modalidade', () => {
      const { modalidade } = parseLicitacao('Documento sem modalidade definida');
      expect(modalidade).toBeNull();
    });
  });

  describe('numero_processo', () => {
    it('extrai número do processo no formato "Processo n° 001/2024"', () => {
      const { numero_processo } = parseLicitacao('Processo n° 001/2024 referente à compra');
      expect(numero_processo).toBe('001/2024');
    });

    it('extrai com variação "Processo Licitatório nº"', () => {
      const { numero_processo } = parseLicitacao('Processo Licitatório nº 012/2023');
      expect(numero_processo).toBe('012/2023');
    });

    it('retorna null quando não há número', () => {
      const { numero_processo } = parseLicitacao('Texto sem número de processo');
      expect(numero_processo).toBeNull();
    });
  });

  describe('valor_estimado', () => {
    it('parseia valor em reais com ponto como separador de milhar', () => {
      const { valor_estimado } = parseLicitacao('Valor estimado: R$ 1.500,00');
      expect(valor_estimado).toBe(1500);
    });

    it('retorna null quando não há valor', () => {
      const { valor_estimado } = parseLicitacao('Texto sem valor monetário');
      expect(valor_estimado).toBeNull();
    });
  });

  describe('confianca', () => {
    it('retorna 0 quando nenhum campo é encontrado', () => {
      const { confianca } = parseLicitacao('');
      expect(confianca).toBe(0);
    });

    it('retorna 1 quando todos os 5 campos são encontrados', () => {
      const texto = [
        'Pregão Eletrônico n° 001/2024',
        'Processo n° 001/2024',
        'Data de abertura: 15/03/2024',
        'Valor estimado: R$ 10.000,00',
        'Objeto: Aquisição de materiais de escritório\n\nOutras informações',
      ].join('\n');
      const { confianca } = parseLicitacao(texto);
      expect(confianca).toBe(1);
    });

    it('retorna valor proporcional aos campos encontrados', () => {
      const { confianca } = parseLicitacao('Pregão Eletrônico');
      expect(confianca).toBeGreaterThan(0);
      expect(confianca).toBeLessThan(1);
    });
  });

  describe('texto vazio ou nulo', () => {
    it('retorna objeto com todos nulls para texto vazio', () => {
      const resultado = parseLicitacao('');
      expect(resultado.modalidade).toBeNull();
      expect(resultado.numero_processo).toBeNull();
      expect(resultado.confianca).toBe(0);
    });

    it('não lança erro para null', () => {
      expect(() => parseLicitacao(null)).not.toThrow();
    });
  });
});
