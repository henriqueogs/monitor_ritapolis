'use strict';

const {
  tokenizar,
  montarMatchFts,
  identificadoresDocumento,
  tokensBrutos,
  contemSequencia,
} = require('./lexical');

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

describe('identificadoresDocumento (N/AAAA)', () => {
  it('extrai número e ano; devolve variantes com e sem zeros à esquerda', () => {
    expect(identificadoresDocumento('Decreto nº 3/2025?')).toEqual(
      expect.arrayContaining([
        ['3', '2025'],
        ['003', '2025'],
        ['0003', '2025'],
        ['000003', '2025'],
      ])
    );
    expect(identificadoresDocumento('Dispensa 034/2026')).toEqual(
      expect.arrayContaining([
        ['034', '2026'],
        ['34', '2026'],
        ['000034', '2026'],
      ])
    );
  });

  it('aceita espaços em volta da barra e vários identificadores', () => {
    const r = identificadoresDocumento('compare 3 / 2025 e 15/2024');

    expect(r).toEqual(
      expect.arrayContaining([
        ['3', '2025'],
        ['15', '2024'],
      ])
    );
  });

  it('não trata data, fração, valor ou ano solto como identificador', () => {
    expect(identificadoresDocumento('em 10/03/2025 houve')).toEqual([]);
    expect(identificadoresDocumento('R$ 1.234/5678')).toEqual([]);
    expect(identificadoresDocumento('ano de 2025, item 3')).toEqual([]);
    expect(identificadoresDocumento('')).toEqual([]);
    expect(identificadoresDocumento(null)).toEqual([]);
  });

  it('sem repetição', () => {
    const r = identificadoresDocumento('3/2025 e 3/2025');
    const chaves = r.map(p => p.join('|'));

    expect(new Set(chaves).size).toBe(chaves.length);
  });
});

describe('montarMatchFts com identificadores', () => {
  it('acrescenta o identificador como FRASE (tokens adjacentes), sem perder os termos soltos', () => {
    const m = montarMatchFts('Decreto nº 3/2025');

    expect(m).toContain('"decreto"');
    expect(m).toContain('"2025"');
    expect(m).toContain('"3 2025"');
  });

  it('consulta só com identificador ainda gera MATCH', () => {
    expect(montarMatchFts('3/2025')).toContain('"3 2025"');
  });

  it('nada da pergunta vira operador mesmo com identificadores', () => {
    expect(montarMatchFts('" OR 3/2025 NEAR(')).not.toMatch(/NEAR\(|\*/);
  });
});

describe('tokensBrutos e contemSequencia (usados pelo store em memória)', () => {
  it('tokensBrutos mantém números curtos e stopwords (adjacência real do texto)', () => {
    expect(tokensBrutos('Decreto nº 3/2025 de Ritápolis')).toEqual([
      'decreto',
      'no',
      '3',
      '2025',
      'de',
      'ritapolis',
    ]);
  });

  it('contemSequencia exige tokens adjacentes e na ordem', () => {
    const tokens = tokensBrutos('Decreto nº 3/2025 e decreto 30/2025');

    expect(contemSequencia(tokens, ['3', '2025'])).toBe(true);
    expect(contemSequencia(tokens, ['2025', '3'])).toBe(false);
    expect(contemSequencia(tokens, ['3', '30'])).toBe(false);
    expect(contemSequencia(tokens, [])).toBe(false);
  });
});
