'use strict';

const { candidatoParaAlerta, persistirCandidatos } = require('./persistencia');
const { avaliarGateDeterministico } = require('../gate-deterministico');

const candidato = (extra = {}) => ({
  vertente: 'compras-repetidas',
  versao: 2,
  objeto: 'Compras repetidas de pneus',
  metrica: { nome: 'soma_janela', valor: 120000 },
  evidencias: [{ fonte_id: 7, documento_id: 7, url_origem: 'https://x.gov.br/a', trecho: 'pneus' }],
  periodo: { ano: 2025 },
  severidade: 'atencao',
  ...extra,
});

describe('candidatoParaAlerta', () => {
  it('entra sempre em revisão, nunca publicado', () => {
    const { alerta } = candidatoParaAlerta(candidato());
    expect(alerta.estado_editorial).toBe('revisao');
    expect(alerta.estado_editorial_origem).toBe('gerador_factual');
  });

  it('marca versão de qualidade da vertente e período anual', () => {
    const { alerta } = candidatoParaAlerta(candidato());
    expect(alerta.qualidade_versao).toBe('vertente-compras-repetidas-v2');
    expect(alerta.periodo_inicio).toBe('2025-01-01');
    expect(alerta.periodo_fim).toBe('2025-12-31');
  });

  it('chave_unica estável e distinta por objeto/período', () => {
    const a = candidatoParaAlerta(candidato()).alerta.chave_unica;
    expect(candidatoParaAlerta(candidato()).alerta.chave_unica).toBe(a);
    expect(candidatoParaAlerta(candidato({ periodo: { ano: 2024 } })).alerta.chave_unica).not.toBe(
      a
    );
    expect(candidatoParaAlerta(candidato({ objeto: 'outro' })).alerta.chave_unica).not.toBe(a);
  });

  it('mapeia evidências guardando url_origem', () => {
    const { evidencias } = candidatoParaAlerta(candidato());
    expect(evidencias[0]).toMatchObject({ documento_id: 7, trecho_fonte: 'pneus' });
    expect(evidencias[0].metadados.url_origem).toBe('https://x.gov.br/a');
  });

  it('gate determinístico reconhece a versão da vertente', () => {
    const { alerta } = candidatoParaAlerta(candidato());
    expect(avaliarGateDeterministico(alerta, { pendencias: [] }).aplicavel).toBe(true);
  });
});

describe('persistirCandidatos', () => {
  it('grava cada candidato e conta falhas sem interromper', () => {
    const upsert = jest
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('db');
      })
      .mockImplementation(() => {});
    const r = persistirCandidatos([candidato(), candidato({ objeto: 'b' })], { upsert });
    expect(r).toEqual({ gravados: 1, falhas: 1 });
  });

  it('dryRun não grava', () => {
    const upsert = jest.fn();
    const r = persistirCandidatos([candidato()], { upsert, dryRun: true });
    expect(upsert).not.toHaveBeenCalled();
    expect(r.gravados).toBe(0);
  });
});
