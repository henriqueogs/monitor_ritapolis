'use strict';

const { fundirRRF, RRF_K } = require('./rrf');

const ramo = (nome, ...ids) => ({ nome, itens: ids.map(id => ({ id, texto: `t${id}` })) });

describe('fundirRRF (Reciprocal Rank Fusion, ADR 0003)', () => {
  it('score = soma de 1/(k + posição) nos ramos em que o item aparece', () => {
    const r = fundirRRF([ramo('vetor', 'a', 'b'), ramo('lexical', 'b', 'c')]);

    const porId = Object.fromEntries(r.map(x => [x.id, x.scoreRrf]));
    expect(porId.a).toBeCloseTo(1 / (RRF_K + 1));
    expect(porId.b).toBeCloseTo(1 / (RRF_K + 2) + 1 / (RRF_K + 1));
    expect(porId.c).toBeCloseTo(1 / (RRF_K + 2));
  });

  it('ordena por score desc; item presente nos dois ramos vence', () => {
    const r = fundirRRF([ramo('vetor', 'a', 'b'), ramo('lexical', 'b', 'c')]);

    expect(r.map(x => x.id)).toEqual(['b', 'a', 'c']);
  });

  it('registra em quais ramos cada item apareceu', () => {
    const r = fundirRRF([ramo('vetor', 'a', 'b'), ramo('lexical', 'b')]);

    expect(r.find(x => x.id === 'a').ramos).toEqual(['vetor']);
    expect(r.find(x => x.id === 'b').ramos).toEqual(['vetor', 'lexical']);
  });

  it('empate de score é resolvido por id crescente (determinístico)', () => {
    const r = fundirRRF([ramo('vetor', 'b'), ramo('lexical', 'a')]);

    expect(r.map(x => x.id)).toEqual(['a', 'b']);
  });

  it('preserva os campos do item do primeiro ramo que o trouxe', () => {
    const r = fundirRRF([ramo('vetor', 'a'), ramo('lexical', 'a')]);

    expect(r[0]).toMatchObject({ id: 'a', texto: 'ta' });
  });

  it('limite corta o resultado; ramos vazios não atrapalham', () => {
    const r = fundirRRF([ramo('vetor', 'a', 'b', 'c'), ramo('lexical')], { limite: 2 });

    expect(r.map(x => x.id)).toEqual(['a', 'b']);
  });

  it('sem ramos devolve lista vazia', () => {
    expect(fundirRRF([])).toEqual([]);
  });

  it('invariância: permutar a ordem dos ramos não muda o ranking', () => {
    const v = ramo('vetor', 'a', 'b', 'c');
    const l = ramo('lexical', 'c', 'a', 'd');

    expect(fundirRRF([v, l]).map(x => x.id)).toEqual(fundirRRF([l, v]).map(x => x.id));
  });

  it('item repetido dentro do mesmo ramo conta uma vez (a melhor posição)', () => {
    const r = fundirRRF([ramo('vetor', 'a', 'a', 'b')]);

    expect(r.find(x => x.id === 'a').scoreRrf).toBeCloseTo(1 / (RRF_K + 1));
  });
});
