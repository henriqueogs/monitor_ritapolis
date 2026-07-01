'use strict';

const { detectarFatosAgregados } = require('./fatos-agregados');

function fato(id, documentoId, quantidade, data, overrides = {}) {
  return {
    id,
    documento_id: documentoId,
    anexo_id: id + 100,
    tipo: 'meio_ambiente',
    subtipo: 'supressao_arvores',
    descricao: `${quantidade} arvores`,
    quantidade,
    unidade: 'arvores',
    periodo_inicio: data,
    data_publicacao: data,
    ano: 2026,
    trecho_fonte: `supressao de ${quantidade} arvores`,
    confianca: 0.86,
    ...overrides,
  };
}

describe('detectarFatosAgregados', () => {
  it('gera uma descoberta anual de arvores, deduplicando repeticoes por documento', () => {
    const alertas = detectarFatosAgregados([
      fato(1, 10, 60, '2026-05-25', { anexo_id: null }),
      fato(2, 10, 60, '2026-05-25'),
      fato(3, 10, 6, '2026-05-25'),
      fato(4, 11, 10, '2026-02-23', { anexo_id: null }),
      fato(5, 11, 6, '2026-02-23'),
    ], { thresholdArvores: 20 });

    const arvores = alertas.filter((a) => a.metadados?.tipo_fato === 'meio_ambiente.supressao_arvores');
    expect(arvores).toHaveLength(1);
    expect(arvores[0].chave_unica).toBe('fato|meio-ambiente|supressao-arvores|ano|2026');
    expect(arvores[0].valor_total).toBe(70);
    expect(arvores[0].documentos).toHaveLength(2);
    expect(arvores[0].evidencias).toHaveLength(2);
    expect(arvores[0].metadados.janelas.length).toBeGreaterThan(0);
    expect(alertas.some((a) => a.chave_unica.includes('|janela-'))).toBe(false);
  });
});
