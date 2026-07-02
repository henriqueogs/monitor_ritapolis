'use strict';

const {
  extrairCodigo,
  classificarCategoria,
  slugParaPrefixos,
  CATEGORIAS,
} = require('./categorias');

describe('categorias', () => {
  describe('extrairCodigo', () => {
    it('extrai elemento de despesa (4 pares) descartando subelemento e rótulo', () => {
      expect(extrairCodigo('3.3.50.43.00 - SUBVENÇÕES SOCIAIS')).toBe('3.3.50.43');
      expect(extrairCodigo('3.3.90.14.00 - DIÁRIAS - CIVIL')).toBe('3.3.90.14');
      expect(extrairCodigo('8.8.01.91.00 - INSS RETENÇÕES DIVERSAS')).toBe('8.8.01.91');
    });

    it('aceita código sem subelemento', () => {
      expect(extrairCodigo('4.4.90.51 - OBRAS E INSTALAÇÕES')).toBe('4.4.90.51');
    });

    it('retorna null para entrada vazia ou sem dígitos', () => {
      expect(extrairCodigo(null)).toBeNull();
      expect(extrairCodigo('')).toBeNull();
      expect(extrairCodigo('SEM CÓDIGO')).toBeNull();
    });
  });

  describe('classificarCategoria', () => {
    it.each([
      ['3.3.90.14.00 - DIÁRIAS - CIVIL', 'diarias', 'Diárias'],
      ['3.3.90.30.00 - MATERIAL DE CONSUMO', 'material', 'Material de consumo'],
      ['3.3.90.32.00 - MATERIAL P/ DISTRIB. GRATUITA', 'distribuicao-gratuita', 'Distribuição gratuita'],
      ['3.3.90.33.00 - PASSAGENS E LOCOMOÇÃO', 'passagens', 'Passagens e locomoção'],
      ['3.3.90.36.00 - OUTROS SERVIÇOS PF', 'servicos-pf', 'Serviços de pessoa física'],
      ['3.3.90.39.00 - OUTROS SERVIÇOS PJ', 'servicos-pj', 'Serviços de empresas'],
      ['3.3.93.39.00 - OUTROS SERVIÇOS TERC. PJ', 'servicos-pj', 'Serviços de empresas'],
      ['4.4.90.51.00 - OBRAS E INSTALAÇÕES', 'obras', 'Obras e instalações'],
      ['4.4.93.51.00 - OBRAS E INSTALAÇÕES', 'obras', 'Obras e instalações'],
      ['4.4.90.52.00 - EQUIPAMENTO E MATERIAL PERMANENTE', 'equipamentos', 'Equipamentos'],
      ['3.3.50.43.00 - SUBVENÇÕES SOCIAIS', 'subvencoes', 'Subvenções a entidades'],
      ['3.1.90.11.00 - VENCIMENTOS E VANTAGENS FIXAS', 'pessoal', 'Pessoal'],
      ['3.1.91.13.00 - OBRIGAÇÕES PATRONAIS', 'encargos', 'Encargos sociais'],
      ['3.1.90.13.00 - OBRIGAÇÕES PATRONAIS', 'encargos', 'Encargos sociais'],
      ['3.3.90.47.00 - OBRIGAÇÕES TRIBUTÁRIAS', 'encargos', 'Encargos sociais'],
      ['3.3.90.91.00 - SENTENÇAS JUDICIAIS', 'sentencas-judiciais', 'Sentenças judiciais'],
      ['3.3.90.48.00 - OUTROS AUXÍLIOS FINANCEIROS PESSSOAS FÍSICAS', 'auxilios-pf', 'Auxílios a pessoas físicas'],
      ['3.2.90.21.00 - JUROS SOBRE A DÍVIDA', 'divida', 'Dívida pública'],
      ['4.6.90.71.00 - PRINCIPAL DA DÍVIDA', 'divida', 'Dívida pública'],
      ['8.8.01.00.05 - INSS INSCRICAO DE DESCONTOS', 'extra-orcamentario', 'Extra-orçamentário'],
      ['8.0.21.01.00 - TRANSFERÊNCIA DE RECURSOS PARA A CÂMARA', 'extra-orcamentario', 'Extra-orçamentário'],
    ])('classifica %s como %s', (entrada, slug, rotulo) => {
      const c = classificarCategoria(entrada);
      expect(c.slug).toBe(slug);
      expect(c.rotulo).toBe(rotulo);
    });

    it('usa fallback por grupo para elementos não mapeados', () => {
      expect(classificarCategoria('3.3.90.93.00 - INDENIZAÇÕES').slug).toBe('outros-custeios');
      expect(classificarCategoria('3.1.90.94.00 - INDENIZAÇÕES TRABALHISTAS').slug).toBe('pessoal');
      expect(classificarCategoria('4.4.90.61.00 - AQUISIÇÃO DE IMÓVEIS').slug).toBe('outros-investimentos');
    });

    it('desconhecido/vazio vira outros', () => {
      expect(classificarCategoria('9.9.99.99.99 - ALGO').slug).toBe('outros');
      expect(classificarCategoria(null).slug).toBe('outros');
      expect(classificarCategoria('').slug).toBe('outros');
    });

    it('toda categoria classificada tem slug, rotulo e grupo', () => {
      const c = classificarCategoria('3.3.90.14.00 - DIÁRIAS');
      expect(c).toEqual({
        slug: 'diarias',
        rotulo: 'Diárias',
        grupo: expect.any(String),
      });
    });
  });

  describe('slugParaPrefixos', () => {
    it('retorna prefixos do slug', () => {
      expect(slugParaPrefixos('diarias')).toEqual(['3.3.90.14']);
      expect(slugParaPrefixos('obras')).toEqual(expect.arrayContaining(['4.4.90.51', '4.4.93.51']));
      expect(slugParaPrefixos('servicos-pj')).toEqual(expect.arrayContaining(['3.3.90.39', '3.3.93.39']));
    });

    it('retorna null para slug desconhecido', () => {
      expect(slugParaPrefixos('nao-existe')).toBeNull();
    });
  });

  describe('CATEGORIAS', () => {
    it('slugs são únicos', () => {
      const slugs = CATEGORIAS.map((c) => c.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
    });

    it('todo item tem slug, rotulo, grupo e prefixos', () => {
      for (const c of CATEGORIAS) {
        expect(c.slug).toMatch(/^[a-z0-9-]+$/);
        expect(c.rotulo.length).toBeGreaterThan(2);
        expect(['custeio', 'investimento', 'pessoal', 'financeiro', 'extra']).toContain(c.grupo);
        expect(Array.isArray(c.prefixos)).toBe(true);
      }
    });
  });
});
