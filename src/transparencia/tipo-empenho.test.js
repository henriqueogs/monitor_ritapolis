'use strict';

const {
  TIPOS_EMPENHO,
  classificarTipoEmpenho,
  SQL_TIPO_ORDEM_PAGAMENTO,
  SQL_TIPO_ESTIMADO_GLOBAL,
  SQL_TIPO_ORDINARIO,
  sqlTipoOrdinario,
  sqlSemOrdemPagamento,
  SQL_SEM_ORDEM_PAGAMENTO,
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

describe('sqlTipoOrdinario(alias)', () => {
  it('qualifica a coluna e funciona em JOIN com tabela que tambem tem "tipo"', () => {
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(':memory:');
    db.exec("CREATE TABLE td (id INTEGER, tipo TEXT); CREATE TABLE d (id INTEGER, tipo TEXT);");
    db.exec("INSERT INTO td VALUES (1, 'EO - Ordinário'), (2, 'EE - Estimativo'), (3, 'OP - Pagamento');");
    db.exec("INSERT INTO d VALUES (1, 'edital'), (2, 'edital'), (3, 'edital');");

    const sql = sqlTipoOrdinario('td');
    const linhas = db.prepare(`SELECT td.id FROM td JOIN d ON d.id = td.id WHERE ${sql}`).all();

    expect(sql).toContain('td.tipo');
    expect(linhas.map((l) => l.id)).toEqual([1]);
  });

  it('sem alias devolve o fragmento padrao', () => {
    expect(sqlTipoOrdinario()).toBe(SQL_TIPO_ORDINARIO);
  });

  it('sqlSemOrdemPagamento qualifica a coluna pelo alias', () => {
    expect(sqlSemOrdemPagamento()).toBe(SQL_SEM_ORDEM_PAGAMENTO);
    expect(sqlSemOrdemPagamento('tp')).toBe("NOT COALESCE(tp.tipo, '') LIKE 'OP%'");
  });
});
