'use strict';

const {
  TIPOS_EMPENHO,
  classificarTipoEmpenho,
  SQL_TIPO_ORDEM_PAGAMENTO,
  SQL_TIPO_ESTIMADO_GLOBAL,
  SQL_TIPO_ORDINARIO,
} = require('./tipo-empenho');

describe('tipo-empenho', () => {
  describe('classificarTipoEmpenho', () => {
    it.each([
      ['EO - Empenho Ordinário', TIPOS_EMPENHO.ORDINARIO],
      ['EE - Empenho Estimativo', TIPOS_EMPENHO.ESTIMADO],
      ['EG - Empenho Global', TIPOS_EMPENHO.GLOBAL],
      ['OP - Ordem de Pagamento', TIPOS_EMPENHO.ORDEM_PAGAMENTO],
    ])('classifica "%s"', (texto, esperado) => {
      expect(classificarTipoEmpenho(texto)).toBe(esperado);
    });

    it('normaliza caixa e espaços', () => {
      expect(classificarTipoEmpenho('  eg - global ')).toBe(TIPOS_EMPENHO.GLOBAL);
    });

    it('trata tipo ausente ou desconhecido como ordinário (não perde valor)', () => {
      expect(classificarTipoEmpenho(null)).toBe(TIPOS_EMPENHO.ORDINARIO);
      expect(classificarTipoEmpenho('XX - Qualquer')).toBe(TIPOS_EMPENHO.ORDINARIO);
    });
  });

  describe('fragmentos SQL', () => {
    it('particionam todo tipo em exatamente um grupo', () => {
      const { DatabaseSync } = require('node:sqlite');
      const db = new DatabaseSync(':memory:');
      db.exec('CREATE TABLE t (tipo TEXT)');
      const tipos = [
        'EO - Empenho Ordinário',
        'EE - Empenho Estimativo',
        'EG - Empenho Global',
        'OP - Ordem de Pagamento',
        'XX - Desconhecido',
        null,
      ];
      for (const tipo of tipos) {db.prepare('INSERT INTO t VALUES (?)').run(tipo);}

      const contar = (where) => db.prepare(`SELECT COUNT(*) n FROM t WHERE ${where}`).get().n;
      const ord = contar(SQL_TIPO_ORDINARIO);
      const estGlob = contar(SQL_TIPO_ESTIMADO_GLOBAL);
      const op = contar(SQL_TIPO_ORDEM_PAGAMENTO);

      expect(ord + estGlob + op).toBe(tipos.length);
      expect(estGlob).toBe(2);
      expect(op).toBe(1);
      expect(ord).toBe(3);
    });
  });
});
