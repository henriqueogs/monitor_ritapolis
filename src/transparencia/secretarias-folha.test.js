'use strict';

const { canonicalizarSecretaria, nomesOriginais } = require('./secretarias-folha');

describe('secretarias-folha (mudança de nome Departamento -> Secretaria, out/2025)', () => {
  it('unifica o nome antigo no novo quando é a mesma pasta', () => {
    expect(canonicalizarSecretaria('DEPARTAMENTO MUNICIPAL DE EDUCACAO')).toBe('SECRETARIA DE EDUCACAO');
    expect(canonicalizarSecretaria('DEPARTAMENTO MUNICIPAL DE SAUDE')).toBe('SECRETARIA DE SAUDE');
    expect(canonicalizarSecretaria('DEPARTAMENTO MUNICIPAL DE FAZENDA')).toBe('SECRETARIA DE FAZENDA');
    expect(canonicalizarSecretaria('DEPARTAMENTO MUNICIPAL DE ADMINISTRACAO')).toBe('SECRETARIA DE ADMINISTRACAO');
    expect(canonicalizarSecretaria('DEPARTAMENTO MUNICIPAL DE OBRAS E URBANIS')).toBe('SECRETARIA DE OBRAS E URBANISMO');
    expect(canonicalizarSecretaria('DEPARTAMENTO MUNICIPAL DE ESPORTE E LAZER')).toBe('SECRETARIA DE ESPORTES E LAZER');
  });

  it('o nome novo permanece igual', () => {
    expect(canonicalizarSecretaria('SECRETARIA DE EDUCACAO')).toBe('SECRETARIA DE EDUCACAO');
  });

  it('nao inventa equivalencia: nomes ambiguos ficam como estao', () => {
    for (const nome of ['EDUCACAO', 'OBRAS', 'FAZENDA', 'GABINETE DO PREFEITO', 'PRESTADOR DE SERVICO',
      'DEPARTAMENTO MUNICIPAL DE ASSISTENCIA SOCIAL', 'DEPARTAMENTO MUNICIPAL DE AGROPECUARIA',
      'DEPTO MUN DE TUR CULT ESPORTE E LAZER']) {
      expect(canonicalizarSecretaria(nome)).toBe(nome);
    }
  });

  it('tolera null/undefined/espacos', () => {
    expect(canonicalizarSecretaria(null)).toBeNull();
    expect(canonicalizarSecretaria('  DEPARTAMENTO MUNICIPAL DE SAUDE ')).toBe('SECRETARIA DE SAUDE');
  });

  it('nomesOriginais devolve o canonico e todas as variantes antigas (para filtrar)', () => {
    expect(nomesOriginais('SECRETARIA DE SAUDE').sort()).toEqual(
      ['DEPARTAMENTO MUNICIPAL DE SAUDE', 'SECRETARIA DE SAUDE'].sort()
    );
    expect(nomesOriginais('DEPARTAMENTO MUNICIPAL DE SAUDE')).toEqual(
      expect.arrayContaining(['DEPARTAMENTO MUNICIPAL DE SAUDE', 'SECRETARIA DE SAUDE'])
    );
    expect(nomesOriginais('GABINETE DO PREFEITO')).toEqual(['GABINETE DO PREFEITO']);
  });
});
