'use strict';

const {
  montarDocumentosExemplo,
  podeSemearExemplo,
  MARCA_EXEMPLO,
  SLUG_EXEMPLO,
} = require('./documentos-exemplo');

const MUNICIPIO = { slug: '_exemplo', nome: 'Cidade Exemplo', uf: 'SP' };

describe('documentos-exemplo (dados fictícios para subir o projeto sem coleta)', () => {
  describe('montarDocumentosExemplo', () => {
    it('gera documentos de pelo menos quatro tipos, das duas fontes', () => {
      // Act
      const documentos = montarDocumentosExemplo({ municipio: MUNICIPIO });

      // Assert
      expect(new Set(documentos.map(d => d.tipo)).size).toBeGreaterThanOrEqual(4);
      expect(new Set(documentos.map(d => d.fonte))).toEqual(new Set(['site_prefeitura', 'camara']));
    });

    it('todo documento tem origem rastreável e data de publicação (CLAUDE.md §11.2 e §11.3)', () => {
      const documentos = montarDocumentosExemplo({ municipio: MUNICIPIO });

      for (const doc of documentos) {
        expect(doc.url_origem).toMatch(/^https:\/\/.+/);
        expect(doc.data_publicacao).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(doc.ano).toBe(Number(doc.data_publicacao.slice(0, 4)));
      }
    });

    it('todo título e toda origem deixam claro que o dado é fictício', () => {
      const documentos = montarDocumentosExemplo({ municipio: MUNICIPIO });

      for (const doc of documentos) {
        expect(doc.titulo.startsWith(MARCA_EXEMPLO)).toBe(true);
        expect(doc.url_origem).toContain('.invalid/');
      }
    });

    it('o texto cita o município da configuração, não um nome fixo', () => {
      const documentos = montarDocumentosExemplo({
        municipio: { ...MUNICIPIO, nome: 'Vila Teste' },
      });

      expect(documentos.every(d => d.texto_completo.includes('Vila Teste'))).toBe(true);
    });

    it('é determinístico: duas chamadas devolvem o mesmo conteúdo (reexecução não duplica)', () => {
      expect(montarDocumentosExemplo({ municipio: MUNICIPIO })).toEqual(
        montarDocumentosExemplo({ municipio: MUNICIPIO })
      );
    });

    it('números de documento não se repetem dentro do mesmo tipo e ano', () => {
      const documentos = montarDocumentosExemplo({ municipio: MUNICIPIO });
      const chaves = documentos.map(d => `${d.tipo}:${d.numero}:${d.ano}`);

      expect(new Set(chaves).size).toBe(chaves.length);
    });
  });

  describe('podeSemearExemplo', () => {
    it('permite no município de exemplo', () => {
      expect(SLUG_EXEMPLO).toBe('_exemplo');
      expect(podeSemearExemplo({ slug: SLUG_EXEMPLO })).toEqual({ pode: true });
    });

    it('recusa em município real, para nunca misturar ficção com dado oficial', () => {
      const resultado = podeSemearExemplo({ slug: 'ritapolis' });

      expect(resultado.pode).toBe(false);
      expect(resultado.motivo).toMatch(/ritapolis/);
    });

    it('--forcar libera em outro município (uso consciente, em banco de teste)', () => {
      expect(podeSemearExemplo({ slug: 'ritapolis', forcar: true })).toEqual({ pode: true });
    });
  });
});
