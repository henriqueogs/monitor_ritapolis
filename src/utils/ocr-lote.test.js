'use strict';

const { montarListagemImagem, motivoRecusaImportacao } = require('./ocr-lote');

describe('ocr-lote', () => {
  describe('montarListagemImagem', () => {
    it('sem filtros lista todos os documentos de imagem com PDF', () => {
      const { sql, params } = montarListagemImagem();
      expect(sql).toContain("status_coleta = 'imagem'");
      expect(params).toEqual([]);
    });

    it('filtra por fonte e tipo com parametros, nunca por interpolacao', () => {
      const { sql, params } = montarListagemImagem({ fonte: 'camara', tipo: 'portaria', limite: 20 });
      expect(sql).toContain('fonte = ?');
      expect(sql).toContain('tipo = ?');
      expect(sql).toContain('LIMIT 20');
      expect(params).toEqual(['camara', 'portaria']);
    });

    it('ignora limite invalido', () => {
      expect(montarListagemImagem({ limite: 'x; DROP' }).sql).not.toContain('LIMIT');
    });
  });

  describe('motivoRecusaImportacao', () => {
    const doc = { id: 1, status_coleta: 'imagem', texto_completo: null, url_pdf: 'http://x/a.pdf' };
    const item = { id: 1, url_pdf: 'http://x/a.pdf', texto: 'a'.repeat(300) };

    it('aceita documento ainda sem texto e com mesma URL', () => {
      expect(motivoRecusaImportacao(item, doc)).toBeNull();
    });

    it('recusa documento inexistente', () => {
      expect(motivoRecusaImportacao(item, undefined)).toBe('documento_inexistente');
    });

    it('recusa quando a URL do PDF mudou (id nao e o mesmo arquivo)', () => {
      expect(motivoRecusaImportacao(item, { ...doc, url_pdf: 'http://x/b.pdf' })).toBe('url_divergente');
    });

    it('recusa quando o documento ja tem texto', () => {
      expect(motivoRecusaImportacao(item, { ...doc, texto_completo: 'x'.repeat(100) })).toBe('ja_tem_texto');
    });

    it('recusa quando deixou de ser imagem', () => {
      expect(motivoRecusaImportacao(item, { ...doc, status_coleta: 'ok' })).toBe('nao_e_imagem');
    });

    it('recusa texto curto demais', () => {
      expect(motivoRecusaImportacao({ ...item, texto: 'curto' }, doc)).toBe('texto_curto');
    });
  });
});
