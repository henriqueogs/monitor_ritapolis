'use strict';

const { escolherMelhorTextoAnexo, MIN_CHARS_TEXTO_UTIL } = require('./anexo-texto');

const anexo = (overrides) => ({
  id: 1,
  tipo: 'edital',
  texto_completo: 'x'.repeat(MIN_CHARS_TEXTO_UTIL + 1),
  status_extracao: 'ok',
  ...overrides,
});

describe('parsers/anexo-texto · escolherMelhorTextoAnexo', () => {
  it('retorna null sem anexos', () => {
    expect(escolherMelhorTextoAnexo([])).toBeNull();
    expect(escolherMelhorTextoAnexo(null)).toBeNull();
  });

  it('retorna null quando nenhum anexo tem texto útil', () => {
    expect(
      escolherMelhorTextoAnexo([anexo({ texto_completo: 'curto' })])
    ).toBeNull();
  });

  it('ignora anexos sem extração ok', () => {
    expect(
      escolherMelhorTextoAnexo([anexo({ status_extracao: 'requer_ocr' })])
    ).toBeNull();
  });

  it('ignora anexos tecnicos visuais mesmo com muito texto extraido', () => {
    expect(
      escolherMelhorTextoAnexo([anexo({ status_extracao: 'tecnico_visual', texto_completo: 'x'.repeat(9000) })])
    ).toBeNull();
  });

  it('prefere anexo do tipo edital sobre outros tipos', () => {
    const escolhido = escolherMelhorTextoAnexo([
      anexo({ id: 1, tipo: 'outro', texto_completo: 'a'.repeat(9000) }),
      anexo({ id: 2, tipo: 'edital', texto_completo: 'b'.repeat(2000) }),
    ]);
    expect(escolhido.id).toBe(2);
  });

  it('entre anexos do mesmo tipo, escolhe o de maior texto', () => {
    const escolhido = escolherMelhorTextoAnexo([
      anexo({ id: 1, texto_completo: 'a'.repeat(2000) }),
      anexo({ id: 2, texto_completo: 'b'.repeat(8000) }),
    ]);
    expect(escolhido.id).toBe(2);
  });

  it('usa anexo de outro tipo quando não há edital com texto útil', () => {
    const escolhido = escolherMelhorTextoAnexo([
      anexo({ id: 1, tipo: 'outro', texto_completo: 'a'.repeat(3000) }),
      anexo({ id: 2, tipo: 'edital', texto_completo: 'pequeno' }),
    ]);
    expect(escolhido.id).toBe(1);
  });

  it('nunca promove anexos de proposta ou recurso (não descrevem o processo)', () => {
    expect(
      escolherMelhorTextoAnexo([
        anexo({ tipo: 'proposta' }),
        anexo({ tipo: 'recurso' }),
      ])
    ).toBeNull();
  });
});
