'use strict';

const { validateAnexoResumo } = require('./anexo-resumo-contract');

function base(overrides = {}) {
  return {
    resumo_curto: 'O anexo traz a ata de julgamento com o vencedor e o valor homologado.',
    pontos_relevantes: [
      { tipo: 'valor', subtipo: 'homologado', descricao: 'Valor final registrado na ata.', quantidade: 1200.5, unidade: 'R$' },
    ],
    lacunas: [],
    confianca: 0.8,
    ...overrides,
  };
}

describe('anexo-resumo-contract', () => {
  it('aceita um payload valido', () => {
    const validado = validateAnexoResumo(base());
    expect(validado.resumo_curto).toContain('ata de julgamento');
    expect(validado.pontos_relevantes).toHaveLength(1);
  });

  it('aceita pontos_relevantes e lacunas vazios (default)', () => {
    const validado = validateAnexoResumo(base({ pontos_relevantes: undefined, lacunas: undefined }));
    expect(validado.pontos_relevantes).toEqual([]);
    expect(validado.lacunas).toEqual([]);
  });

  it('rejeita resumo_curto vazio', () => {
    expect(() => validateAnexoResumo(base({ resumo_curto: '' }))).toThrow(/fora do contrato/);
  });

  it('rejeita confianca fora de 0-1', () => {
    expect(() => validateAnexoResumo(base({ confianca: 1.5 }))).toThrow(/fora do contrato/);
  });

  it('rejeita mais de 10 pontos_relevantes', () => {
    const muitos = Array.from({ length: 11 }, (_, i) => ({ tipo: `t${i}` }));
    expect(() => validateAnexoResumo(base({ pontos_relevantes: muitos }))).toThrow(/fora do contrato/);
  });

  it('rejeita ponto relevante sem tipo', () => {
    expect(() => validateAnexoResumo(base({ pontos_relevantes: [{ descricao: 'sem tipo' }] }))).toThrow(/fora do contrato/);
  });

  it('converte quantidade em formato BR (string) para numero', () => {
    const validado = validateAnexoResumo(
      base({ pontos_relevantes: [{ tipo: 'valor', quantidade: '12.400,00', unidade: 'R$' }] })
    );
    expect(validado.pontos_relevantes[0].quantidade).toBeCloseTo(12400.0);
  });

  it('converte quantidade string simples (sem separador de milhar) para numero', () => {
    const validado = validateAnexoResumo(
      base({ pontos_relevantes: [{ tipo: 'quantidade', quantidade: '60', unidade: 'árvores' }] })
    );
    expect(validado.pontos_relevantes[0].quantidade).toBe(60);
  });

  it('vira null quando a quantidade string nao e numero (nao derruba o resumo inteiro)', () => {
    const validado = validateAnexoResumo(
      base({ pontos_relevantes: [{ tipo: 'valor', quantidade: 'nao informado' }] })
    );
    expect(validado.pontos_relevantes[0].quantidade).toBeNull();
  });
});
