'use strict';

const { detectarAnomaliaTemporal } = require('./anomalia-temporal');

function doc(id, categoria, ano) {
  return { id, categoria, ano, data_publicacao: `${ano}-01-01`, valor: 0, resumo: null };
}

describe('detectarAnomaliaTemporal', () => {
  it('detecta pico: ano com muito mais processos que a média dos outros', () => {
    const docs = [
      doc(1, 'Saúde', 2022), doc(2, 'Saúde', 2023), doc(3, 'Saúde', 2024),
      doc(4, 'Saúde', 2025), doc(5, 'Saúde', 2025), doc(6, 'Saúde', 2025),
    ];
    const sinais = detectarAnomaliaTemporal(docs, { multiplicador: 3, minAbsoluto: 3 });
    expect(sinais).toHaveLength(1);
    expect(sinais[0].ano).toBe(2025);
    expect(sinais[0].categoria).toBe('Saúde');
    expect(sinais[0].documentos).toHaveLength(3);
  });

  it('não emite sinal quando não há pico', () => {
    const docs = [doc(1, 'Saúde', 2024), doc(2, 'Saúde', 2025)];
    const sinais = detectarAnomaliaTemporal(docs);
    expect(sinais).toHaveLength(0);
  });

  it('requer ao menos 2 anos para comparar', () => {
    const docs = [doc(1, 'Saúde', 2025), doc(2, 'Saúde', 2025), doc(3, 'Saúde', 2025)];
    const sinais = detectarAnomaliaTemporal(docs);
    expect(sinais).toHaveLength(0);
  });

  it('ignora categoria "Outros"', () => {
    const docs = [
      doc(1, 'Outros', 2022), doc(2, 'Outros', 2023),
      doc(3, 'Outros', 2025), doc(4, 'Outros', 2025), doc(5, 'Outros', 2025),
    ];
    const sinais = detectarAnomaliaTemporal(docs);
    expect(sinais).toHaveLength(0);
  });

  it('ignora documentos sem ano', () => {
    const docs = [
      doc(1, 'Saúde', null), doc(2, 'Saúde', null), doc(3, 'Saúde', null),
    ];
    const sinais = detectarAnomaliaTemporal(docs);
    expect(sinais).toHaveLength(0);
  });

  it('respeita minAbsoluto', () => {
    const docs = [
      doc(1, 'Saúde', 2022), doc(2, 'Saúde', 2023),
      doc(3, 'Saúde', 2025), doc(4, 'Saúde', 2025),
    ];
    const sinais = detectarAnomaliaTemporal(docs, { multiplicador: 2, minAbsoluto: 5 });
    expect(sinais).toHaveLength(0);
  });
});
