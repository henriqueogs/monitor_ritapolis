'use strict';

const { detectarRiscoAlto } = require('./risco-alto');

function doc(id, alertas = []) {
  return { id, categoria: 'Saúde', ano: 2025, resumo: { alertas, confianca: 0.9 } };
}

describe('detectarRiscoAlto', () => {
  it('emite sinal crítico para documento com alerta de nível alto', () => {
    const docs = [
      doc(1, [{ nivel: 'alto', descricao: 'Sobrepreço significativo detectado', fonte: 'ia' }]),
    ];
    const sinais = detectarRiscoAlto(docs);
    expect(sinais).toHaveLength(1);
    expect(sinais[0].tipo).toBe('risco_alto');
    expect(sinais[0].severidade).toBe('critico');
    expect(sinais[0].documentos).toEqual([1]);
    expect(sinais[0].motivo).toContain('Sobrepreço');
  });

  it('ignora alertas de nível médio e baixo', () => {
    const docs = [
      doc(1, [
        { nivel: 'medio', descricao: 'Prazo curto', fonte: 'ia' },
        { nivel: 'baixo', descricao: 'Sem detalhes', fonte: 'ia' },
      ]),
    ];
    const sinais = detectarRiscoAlto(docs);
    expect(sinais).toHaveLength(0);
  });

  it('é case-insensitive no nível', () => {
    const docs = [doc(1, [{ nivel: 'ALTO', descricao: 'Risco', fonte: 'ia' }])];
    const sinais = detectarRiscoAlto(docs);
    expect(sinais).toHaveLength(1);
  });

  it('ignora alerta alto sem descrição', () => {
    const docs = [doc(1, [{ nivel: 'alto', descricao: '', fonte: 'ia' }])];
    const sinais = detectarRiscoAlto(docs);
    expect(sinais).toHaveLength(0);
  });

  it('lida com resumo nulo', () => {
    const sinais = detectarRiscoAlto([{ id: 1, categoria: 'Saúde', ano: 2025, resumo: null }]);
    expect(sinais).toHaveLength(0);
  });

  it('lida com resumo sem alertas', () => {
    const sinais = detectarRiscoAlto([{ id: 1, categoria: 'Saúde', ano: 2025, resumo: {} }]);
    expect(sinais).toHaveLength(0);
  });
});
