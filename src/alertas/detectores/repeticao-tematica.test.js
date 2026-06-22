'use strict';

const { detectarRepeticaoTematica } = require('./repeticao-tematica');

function doc(id, categoria, ano) {
  return { id, categoria, ano, data_publicacao: `${ano}-01-01`, valor: 0, resumo: null };
}

describe('detectarRepeticaoTematica', () => {
  it('emite sinal quando categoria se repete acima do limiar no mesmo ano', () => {
    const docs = [doc(1, 'Saúde', 2025), doc(2, 'Saúde', 2025), doc(3, 'Saúde', 2025)];
    const sinais = detectarRepeticaoTematica(docs, { minRepeticao: 2 });
    expect(sinais).toHaveLength(1);
    expect(sinais[0].tipo).toBe('repeticao_tematica');
    expect(sinais[0].categoria).toBe('Saúde');
    expect(sinais[0].ano).toBe(2025);
    expect(sinais[0].documentos).toEqual([1, 2, 3]);
    expect(sinais[0].severidade).toBe('info');
  });

  it('não emite sinal quando abaixo do limiar', () => {
    const docs = [doc(1, 'Saúde', 2025), doc(2, 'Saúde', 2025)];
    const sinais = detectarRepeticaoTematica(docs, { minRepeticao: 3 });
    expect(sinais).toHaveLength(0);
  });

  it('ignora categoria "Outros"', () => {
    const docs = [doc(1, 'Outros', 2025), doc(2, 'Outros', 2025), doc(3, 'Outros', 2025)];
    const sinais = detectarRepeticaoTematica(docs);
    expect(sinais).toHaveLength(0);
  });

  it('separa por ano', () => {
    const docs = [doc(1, 'Saúde', 2024), doc(2, 'Saúde', 2025)];
    const sinais = detectarRepeticaoTematica(docs, { minRepeticao: 1 });
    expect(sinais).toHaveLength(2);
  });

  it('ignora categoria nula', () => {
    const docs = [doc(1, null, 2025), doc(2, null, 2025)];
    const sinais = detectarRepeticaoTematica(docs);
    expect(sinais).toHaveLength(0);
  });

  it('usa limiar default 2', () => {
    const docs = [doc(1, 'Educação', 2025), doc(2, 'Educação', 2025)];
    const sinais = detectarRepeticaoTematica(docs);
    expect(sinais).toHaveLength(1);
  });
});
