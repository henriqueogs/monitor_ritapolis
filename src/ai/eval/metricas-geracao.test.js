'use strict';

const { numerosInventados, termosAcusatorios, coberturaFatos } = require('./metricas-geracao');

describe('numerosInventados (fiscal-valores V6: número só se estiver no contexto)', () => {
  const contexto = [
    { texto: 'Valor homologado de R$ 1.500,00 para o item 3, exercício de 2025.' },
    { texto: 'Contrato no total de R$ 48.000,00.' },
  ];

  it('valor presente no contexto não é inventado (mesmo com formatação diferente)', () => {
    expect(numerosInventados('Foram R$ 1.500,00 e R$ 48000,00.', contexto)).toEqual([]);
  });

  it('valor ausente do contexto é devolvido', () => {
    expect(numerosInventados('Pagou-se R$ 9.999,00 ao fornecedor.', contexto)).toEqual([
      'R$ 9.999,00',
    ]);
  });

  it('só confere valores em reais; anos e quantidades soltas não contam', () => {
    expect(numerosInventados('Em 2031 foram 77 itens.', contexto)).toEqual([]);
  });

  it('número solto no contexto (item, ano) não legitima valor em reais', () => {
    expect(numerosInventados('Pagou-se R$ 3,00.', contexto)).toEqual(['R$ 3,00']);
    expect(numerosInventados('Pagou-se R$ 2025,00.', contexto)).toEqual(['R$ 2025,00']);
  });

  it('valor escrito com "reais" também é conferido', () => {
    expect(numerosInventados('Pagou-se 9.999,00 reais.', contexto)).toEqual(['9.999,00 reais']);
    expect(numerosInventados('Foram 1.500,00 reais.', contexto)).toEqual([]);
  });

  it('valor sem marcador de moeda, singular, BRL e magnitude por extenso também são conferidos', () => {
    expect(numerosInventados('Foram 2.500.000,00 no total.', contexto)).toEqual(['2.500.000,00']);
    expect(numerosInventados('Custou 7,00 real.', contexto)).toEqual(['7,00 real']);
    expect(numerosInventados('Pagou 3.000,00 BRL.', contexto)).toEqual(['3.000,00 BRL']);
    expect(numerosInventados('Cerca de 2 milhões de reais.', contexto)).toEqual(['2 milhões']);
    expect(numerosInventados('Foram 48.000,00 e R$ 1.500,00.', contexto)).toEqual([]);
  });

  it('magnitude por extenso só vale se o contexto traz a mesma expressão', () => {
    const ctx = [{ texto: 'Contrato de 2 milhões de reais.' }];

    expect(numerosInventados('Cerca de 2 milhões de reais.', ctx)).toEqual([]);
  });

  it('sem valores na resposta, nada a conferir', () => {
    expect(numerosInventados('A empresa venceu.', contexto)).toEqual([]);
  });
});

describe('termosAcusatorios (fiscal-privacidade N1/N2)', () => {
  it('detecta termos acusatórios sem depender de acento ou caixa', () => {
    expect(termosAcusatorios('Há indício de FRAUDE e de corrupção.').sort()).toEqual([
      'corrup',
      'fraud',
    ]);
  });

  it('pega variações de fraude e crime; lavagem de veículos é neutro', () => {
    expect(termosAcusatorios('Ele fraudou; ato criminal e crime.').sort()).toEqual([
      'crime',
      'crimin',
      'fraud',
    ]);
    expect(termosAcusatorios('Serviço de lavagem de veículos.')).toEqual([]);
    expect(termosAcusatorios('Lavagem de dinheiro.')).toEqual(['lavagem de dinheiro']);
  });

  it('cobre ilícito, improbidade, peculato, malversação, sobrepreço e irregular', () => {
    expect(termosAcusatorios('ato ilícito de improbidade, peculato e malversação')).toEqual(
      expect.arrayContaining(['ilicit', 'improbidade', 'peculato', 'malversa'])
    );
    expect(termosAcusatorios('sobrepreço irregular')).toEqual(
      expect.arrayContaining(['sobrepre', 'irregular'])
    );
  });

  it('texto neutro não aciona', () => {
    expect(termosAcusatorios('Foram empenhados R$ 10,00 à empresa X em 2025.')).toEqual([]);
  });
});

describe('coberturaFatos', () => {
  it('fração dos fatos obrigatórios presentes na resposta (sem acento/caixa)', () => {
    expect(coberturaFatos('Vencedora: ALIMENTOS MINAS.', ['alimentos minas', 'Limpa Bem'])).toBe(
      0.5
    );
  });

  it('sem fatos esperados não há cobertura definida (null)', () => {
    expect(coberturaFatos('qualquer', undefined)).toBeNull();
    expect(coberturaFatos('qualquer', [])).toBeNull();
  });
});
