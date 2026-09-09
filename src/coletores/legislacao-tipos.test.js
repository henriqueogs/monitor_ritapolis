'use strict';

const { normalizarTipo } = require('./legislacao-tipos');

describe('legislacao-tipos · normalizarTipo', () => {
  it('mapeia os tipos ja usados pela legislacao da Prefeitura', () => {
    expect(normalizarTipo('Portaria')).toBe('portaria');
    expect(normalizarTipo('Decreto')).toBe('decreto');
    expect(normalizarTipo('Lei Ordinária')).toBe('lei_ordinaria');
  });

  it('mapeia os tipos novos achados na Camara', () => {
    expect(normalizarTipo('Indicação')).toBe('indicacao');
    expect(normalizarTipo('Requerimento')).toBe('requerimento');
    expect(normalizarTipo('Ata Ordinária')).toBe('ata_ordinaria');
    expect(normalizarTipo('Ata Extraordinária')).toBe('ata_extraordinaria');
    expect(normalizarTipo('Ata Solene')).toBe('ata_solene');
    expect(normalizarTipo('Ata Audiência Pública')).toBe('ata_audiencia_publica');
    expect(normalizarTipo('Ato da Mesa')).toBe('ato_da_mesa');
    expect(normalizarTipo('Emenda à Lei Orgânica')).toBe('emenda_lei_organica');
  });

  it('cai em documento_publico pra rotulo desconhecido (ex: "Promulgada", filtro de status, nao tipo de item)', () => {
    expect(normalizarTipo('Promulgada')).toBe('documento_publico');
    expect(normalizarTipo('Algo Nunca Visto')).toBe('documento_publico');
  });
});
