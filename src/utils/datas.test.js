'use strict';

const { extrairAno } = require('./datas');

describe('extrairAno', () => {
  it('prioriza data_publicacao/data_abertura', () => {
    expect(extrairAno({ dataPublicacao: '2024-03-15' })).toBe(2024);
    expect(extrairAno({ dataAbertura: '2022-11-01', titulo: 'Edital 2019' })).toBe(2022);
  });

  it('extrai ano de 4 dígitos do título (data por extenso)', () => {
    expect(extrairAno({ titulo: 'Resolução nº 8, de 18 de agosto de 2015' })).toBe(2015);
    expect(extrairAno({ titulo: 'Portaria Legislativa nº 20, de 25 de agosto de 2015' })).toBe(2015);
    expect(extrairAno({ titulo: 'Emenda Estadual 2025 Sargento Rodrigues' })).toBe(2025);
  });

  it('extrai ano de número de processo/identificador', () => {
    expect(extrairAno({ titulo: 'Processo 0060/20 - Concorrência Pública nº 02/2020 - Alienação' })).toBe(2020);
    expect(extrairAno({ titulo: 'Processo 0064/24 - Dispensa nº 034/2024 - Aquisição de Tonner' })).toBe(2024);
  });

  it('usa padrão NNNN/AA quando não há ano completo', () => {
    expect(extrairAno({ titulo: 'Processo 0064/24 - Aquisição' })).toBe(2024);
    expect(extrairAno({ numero: '0060/20' })).toBe(2020);
  });

  it('retorna null quando não há ano derivável', () => {
    expect(extrairAno({ titulo: 'TERMO DE POSSE DE MEMBRO DO CONSELHO TUTELAR nº 05' })).toBeNull();
    expect(extrairAno({})).toBeNull();
    expect(extrairAno({ titulo: 'Resolução nº 8' })).toBeNull();
  });

  it('ignora anos implausíveis (fora de 2000..ano+1)', () => {
    expect(extrairAno({ titulo: 'Documento de 1850' })).toBeNull();
    expect(extrairAno({ titulo: 'Projeto para 2099' })).toBeNull();
  });
});
