'use strict';

const { extrairFatosRiscoAlto } = require('./fatos-resumo-riscos');

function documento(overrides = {}) {
  return {
    id: 42,
    titulo: 'Documento de teste',
    data_publicacao: '2026-05-01',
    ano: 2026,
    ...overrides,
  };
}

function resumo(riscos, overrides = {}) {
  return {
    id: 900,
    resumo_json: { riscos_ou_alertas: riscos },
    ...overrides,
  };
}

describe('extrairFatosRiscoAlto', () => {
  it('extrai só riscos de nível alto', () => {
    const fatos = extrairFatosRiscoAlto({
      documento: documento(),
      resumo: resumo([
        { nivel: 'alto', descricao: 'Falta licença ambiental', motivo: 'Documento não cita licença nem compensação.' },
        { nivel: 'medio', descricao: 'Prazo apertado', motivo: 'Prazo de 5 dias é curto.' },
        { nivel: 'baixo', descricao: 'Detalhe menor', motivo: 'x' },
      ]),
    });
    expect(fatos).toHaveLength(1);
    expect(fatos[0].descricao).toBe('Falta licença ambiental');
    expect(fatos[0].tipo).toBe('riscos_resumo');
    expect(fatos[0].subtipo).toBe('risco_alto');
  });

  it('usa o motivo como trecho_fonte e marca a origem como leitura da IA (não citação literal)', () => {
    const fatos = extrairFatosRiscoAlto({
      documento: documento(),
      resumo: resumo([{ nivel: 'alto', descricao: 'D', motivo: 'M explicando o porquê' }]),
    });
    expect(fatos[0].trecho_fonte).toBe('M explicando o porquê');
    expect(fatos[0].metadados.fonte_dado).toBe('resumo_ai_riscos');
  });

  it('sem riscos_ou_alertas ou array vazio, retorna vazio', () => {
    expect(extrairFatosRiscoAlto({ documento: documento(), resumo: resumo([]) })).toEqual([]);
    expect(extrairFatosRiscoAlto({ documento: documento(), resumo: resumo(undefined) })).toEqual([]);
    expect(extrairFatosRiscoAlto({ documento: documento(), resumo: { id: 1, resumo_json: {} } })).toEqual([]);
    expect(extrairFatosRiscoAlto({ documento: documento(), resumo: null })).toEqual([]);
  });

  it('ignora risco alto sem descricao (dado malformado)', () => {
    const fatos = extrairFatosRiscoAlto({
      documento: documento(),
      resumo: resumo([{ nivel: 'alto', motivo: 'sem descricao' }]),
    });
    expect(fatos).toHaveLength(0);
  });

  it('origem_hash é estável pro mesmo risco (mesmo resumo, mesmo índice) — não duplica se reprocessar', () => {
    const args = {
      documento: documento(),
      resumo: resumo([{ nivel: 'alto', descricao: 'D', motivo: 'M' }]),
    };
    const a = extrairFatosRiscoAlto(args)[0];
    const b = extrairFatosRiscoAlto(args)[0];
    expect(a.origem_hash).toBe(b.origem_hash);
  });

  it('dois riscos altos diferentes no mesmo documento geram fatos com origem_hash diferente', () => {
    const fatos = extrairFatosRiscoAlto({
      documento: documento(),
      resumo: resumo([
        { nivel: 'alto', descricao: 'D1', motivo: 'M1' },
        { nivel: 'alto', descricao: 'D2', motivo: 'M2' },
      ]),
    });
    expect(fatos).toHaveLength(2);
    expect(fatos[0].origem_hash).not.toBe(fatos[1].origem_hash);
  });
});
