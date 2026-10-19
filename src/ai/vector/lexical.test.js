'use strict';

const { tokenizar, montarMatchFts } = require('./lexical');

describe('tokenizar', () => {
  it('minúsculas, sem acento, só letras e números; descarta tokens de 1 caractere', () => {
    expect(tokenizar('Licitação 001/2025: Merenda, R$ 1.500,00 (x)')).toEqual([
      'licitacao',
      '001',
      '2025',
      'merenda',
      '500',
      '00',
    ]);
  });

  it('texto vazio ou nulo dá lista vazia', () => {
    expect(tokenizar('')).toEqual([]);
    expect(tokenizar(null)).toEqual([]);
  });

  it('remove stopwords de função em português', () => {
    expect(tokenizar('quem venceu o pregão de merenda')).toEqual(['venceu', 'pregao', 'merenda']);
  });
});

describe('montarMatchFts', () => {
  it('cita cada token (sem sintaxe FTS vazando) e une com OR, sem repetir', () => {
    expect(montarMatchFts('merenda MERENDA escolar')).toBe('"merenda" OR "escolar"');
  });

  it('operadores e aspas da pergunta viram texto inofensivo', () => {
    expect(montarMatchFts('a" OR NEAR(x) -y*')).toBe('"or" OR "near"');
    expect(montarMatchFts('"; DROP TABLE x; --')).toBe('"drop" OR "table"');
  });

  it('consulta sem tokens úteis devolve null', () => {
    expect(montarMatchFts('de a o')).toBeNull();
    expect(montarMatchFts('')).toBeNull();
  });
});
