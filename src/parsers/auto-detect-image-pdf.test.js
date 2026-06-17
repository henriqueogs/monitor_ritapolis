'use strict';

const { isImageBasedPdf } = require('./pdf');

describe('isImageBasedPdf', () => {
  describe('casos positivos (é PDF de imagem)', () => {
    it('retorna true para texto vazio', () => {
      expect(isImageBasedPdf('', 1)).toBe(true);
      expect(isImageBasedPdf('   ', 1)).toBe(true);
      expect(isImageBasedPdf(null, 1)).toBe(true);
      expect(isImageBasedPdf(undefined, 1)).toBe(true);
    });

    it('retorna true para texto muito curto sem palavras reais (< 50 chars/página E < 3 palavras)', () => {
      // 30 chars, 2 "palavras" = lixo
      expect(isImageBasedPdf('a,r t B B !4tS', 1)).toBe(true);
      // 10 chars, 1 palavra = lixo
      expect(isImageBasedPdf('abc def', 1)).toBe(true);
    });

    it('retorna true para baixa densidade de palavras reais (< 30%) em textos > 100 chars', () => {
      // Texto do documento 648: ~22% palavras reais
      const lixo648 = `a,r   t   B  B   !4tS   r   &*1Jt!1:t:   !   :t):11:t::tti:i   t:   t:t   ttt:::  \\   tlLL#UL:;Ç   tYÃw;i{w,#saÀ   qÁ&,  w u*'   Â  i  u  Ç,  Rua   Miguel   Arcanjo   de   Almeida`;
      expect(isImageBasedPdf(lixo648, 1)).toBe(true);
    });

    it('retorna true para proporção baixa de caracteres legíveis (< 60%) em textos > 100 chars', () => {
      // 100 chars, apenas 50 legíveis = 50% < 60%
      const text = 'a'.repeat(50) + '!@#$%^&*()'.repeat(5); // 50 + 50 = 100
      expect(isImageBasedPdf(text, 1)).toBe(true);
    });

    it('retorna true para alta densidade de lixo (> 25% não-legíveis) em textos > 100 chars', () => {
      // 100 chars, 30 lixo = 30% > 25%
      const text = 'a'.repeat(70) + '!@#$%^&*()'.repeat(3); // 70 + 30 = 100
      expect(isImageBasedPdf(text, 1)).toBe(true);
    });

    it('retorna true para corrida longa de símbolos especiais variados', () => {
      // Sequência de 6+ símbolos especiais consecutivos = lixo de encoding
      expect(isImageBasedPdf('texto normal !@#$%^& mais texto', 1)).toBe(true);
    });
  });

  describe('casos negativos (NÃO é PDF de imagem)', () => {
    it('retorna false para texto legível em português', () => {
      const texto = `
        RESOLUÇÃO N. 002/2025
        O Conselho Municipal dos Direitos da Criança e do Adolescente de Ritápolis,
        no exercício de suas atribuições consoante a Lei 1.658/2023,
        RESOLVE:
        Artigo 1º - Solicitar a permanência da conselheira Caroline Maria de Sousa Resende.
        Ritápolis, 03 de janeiro de 2025.
      `;
      expect(isImageBasedPdf(texto, 1)).toBe(false);
    });

    it('retorna false para edital de licitação típico', () => {
      const texto = `
        PREFEITURA MUNICIPAL DE RITÁPOLIS
        EDITAL DE PREGÃO ELETRÔNICO Nº 001/2024
        PROCESSO ADMINISTRATIVO Nº 1234/2024
        OBJETO: Aquisição de mobiliário planejado para escolas municipais.
        VALOR ESTIMADO: R$ 6.510.000,00
        DATA DE ABERTURA: 15/03/2024
      `;
      expect(isImageBasedPdf(texto, 1)).toBe(false);
    });

    it('retorna false quando há palavras reais apesar de um token de lixo isolado', () => {
      // 2 de 3 tokens são palavras reais — texto recuperável, não é imagem
      expect(isImageBasedPdf('abc &*1Jt!1:t: def', 1)).toBe(false);
    });

    it('retorna false para texto com acentos e pontuação normal', () => {
      const texto = 'São Paulo, 16 de junho de 2026. João da Silva assinou o contrato nº 123/2026.';
      expect(isImageBasedPdf(texto, 1)).toBe(false);
    });

    it('retorna false para texto longo com números e valores monetários', () => {
      const texto = 'Valor total: R$ 1.234.567,89. Quantidade: 1.500 unidades. Preço unitário: R$ 823,04.';
      expect(isImageBasedPdf(texto, 1)).toBe(false);
    });

    it('retorna false para texto multi-página com densidade adequada', () => {
      // 5000 chars em 3 páginas = ~1666 chars/página > 100
      const texto = 'Página 1: '.repeat(500) + '\n\nPágina 2: '.repeat(500) + '\n\nPágina 3: '.repeat(500);
      expect(isImageBasedPdf(texto, 3)).toBe(false);
    });

    it('retorna false para texto curto mas com palavras reais (ex: data/cabeçalho)', () => {
      // Textos curtos legítimos como datas, cabeçalhos
      expect(isImageBasedPdf('São Paulo, 16 de junho de 2026', 1)).toBe(false);
      expect(isImageBasedPdf('Ritápolis, 03 de janeiro de 2025', 1)).toBe(false);
    });
  });

  describe('casos de borda', () => {
    it('numPages = 0 ou undefined usa 1 como padrão', () => {
      expect(isImageBasedPdf('a'.repeat(50), 0)).toBe(true);
      expect(isImageBasedPdf('a'.repeat(50), undefined)).toBe(true);
      expect(isImageBasedPdf('a'.repeat(50), null)).toBe(true);
    });

    it('ignora quebras de linha e espaços na contagem de legíveis', () => {
      const texto = 'Linha 1\nLinha 2\nLinha 3';
      expect(isImageBasedPdf(texto, 1)).toBe(false);
    });

    it('não detecta repetição de mesmo caractere como lixo (!!!!!)', () => {
      // Repetição de pontuação não é lixo de OCR
      const texto = 'Texto normal!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! fim';
      expect(isImageBasedPdf(texto, 1)).toBe(false);
    });
  });
});
