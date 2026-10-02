'use strict';
const { csvConfereComRegistro } = require('./despesa-csv');

const stored = {
  tipo: 'EO',
  data_empenho: '2026-10-01',
  data_liquidacao: null,
  data_pagamento: null,
  valor: 100.5,
  credor_nome: 'EMPRESA TESTE LTDA',
  unidade: 'Secretaria',
  historico: 'Compra',
};
const csv = {
  tipo: 'EO',
  dataEmpenho: '2026-10-01',
  dataLiquidacao: null,
  dataPagamento: null,
  valor: 100.5,
  credorNomeParcial: 'EMPRESA TESTE',
};

describe('csvConfereComRegistro', () => {
  it('confere quando campos voláteis e detalhe já armazenado são iguais', () => {
    expect(csvConfereComRegistro(csv, stored)).toBe(true);
  });
  it.each([
    ['sem registro', csv, null],
    ['liquidação nova', { ...csv, dataLiquidacao: '2026-10-05' }, stored],
    ['pagamento novo', { ...csv, dataPagamento: '2026-10-09' }, stored],
    ['valor diferente', { ...csv, valor: 100.51 }, stored],
    ['tipo diferente', { ...csv, tipo: 'ES' }, stored],
    ['data de empenho diferente', { ...csv, dataEmpenho: '2026-10-02' }, stored],
    ['credor diferente', { ...csv, credorNomeParcial: 'OUTRA EMPRESA' }, stored],
    ['detalhe nunca coletado', csv, { ...stored, unidade: null, historico: null }],
  ])('não confere: %s', (_name, row, existing) => {
    expect(csvConfereComRegistro(row, existing)).toBe(false);
  });
  it('credor parcial ignora caixa e acentos', () => {
    expect(
      csvConfereComRegistro({ ...csv, credorNomeParcial: 'empresa tèste' }, stored)
    ).toBe(true);
  });
});
