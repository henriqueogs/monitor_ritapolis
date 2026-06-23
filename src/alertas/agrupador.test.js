'use strict';

const { agruparPorCategoriaAno, agruparPorGrupo, chaveCategoriaAno } = require('./agrupador');

const docs = [
  { id: 1, categoria: 'Meio ambiente', ano: 2026, grupo_id: 10 },
  { id: 2, categoria: 'Meio ambiente', ano: 2026, grupo_id: 10 },
  { id: 3, categoria: 'Meio ambiente', ano: 2025, grupo_id: null },
  { id: 4, categoria: 'Saúde', ano: 2026, grupo_id: 20 },
  { id: 5, categoria: null, ano: null, grupo_id: undefined },
];

describe('agrupador', () => {
  it('chaveCategoriaAno trata null como Outros / sem-ano', () => {
    expect(chaveCategoriaAno({ categoria: null, ano: null })).toBe('Outros|sem-ano');
  });

  it('agrupa por (categoria, ano)', () => {
    const m = agruparPorCategoriaAno(docs);
    expect(m.get('Meio ambiente|2026').map((d) => d.id)).toEqual([1, 2]);
    expect(m.get('Meio ambiente|2025')).toHaveLength(1);
    expect(m.get('Saúde|2026')).toHaveLength(1);
    expect(m.get('Outros|sem-ano')).toHaveLength(1);
  });

  it('agrupa por grupo_id ignorando docs sem grupo', () => {
    const m = agruparPorGrupo(docs);
    expect(m.get('10').map((d) => d.id)).toEqual([1, 2]);
    expect(m.get('20')).toHaveLength(1);
    expect([...m.keys()].sort()).toEqual(['10', '20']);
  });
});
