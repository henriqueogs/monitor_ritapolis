'use strict';

const { validarVertente, validarCandidato, rodarVertentes } = require('./orquestrador');

const evidencia = { fonte_id: 1, url_origem: 'https://exemplo.gov.br/doc1' };
const candidatoOk = () => ({
  objeto: 'Compras repetidas de pneus',
  metrica: { nome: 'soma_janela', valor: 120000 },
  evidencias: [evidencia],
  periodo: { ano: 2025 },
  severidade: 'atencao',
});
const vertenteOk = (detectar = () => [candidatoOk()]) => ({
  nome: 'compras-repetidas',
  versao: 1,
  criterio: 'Mesmo credor e objeto em janela curta.',
  detectar,
});

describe('validarVertente', () => {
  it('aceita vertente completa', () => {
    expect(validarVertente(vertenteOk())).toEqual([]);
  });

  it('lista o que falta', () => {
    const erros = validarVertente({ nome: 'x' });
    expect(erros.join(' ')).toMatch(/versao/);
    expect(erros.join(' ')).toMatch(/criterio/);
    expect(erros.join(' ')).toMatch(/detectar/);
  });
});

describe('validarCandidato', () => {
  it('aceita candidato completo', () => {
    expect(validarCandidato(candidatoOk())).toEqual([]);
  });

  it('exige período (valor sempre escopado, §11.1)', () => {
    const c = { ...candidatoOk(), periodo: null };
    expect(validarCandidato(c).join(' ')).toMatch(/periodo/);
  });

  it('exige evidência com url_origem (§11.3)', () => {
    const c = { ...candidatoOk(), evidencias: [{ fonte_id: 1 }] };
    expect(validarCandidato(c).join(' ')).toMatch(/url_origem/);
    expect(validarCandidato({ ...candidatoOk(), evidencias: [] }).join(' ')).toMatch(/evidencias/);
  });

  it('rejeita severidade desconhecida', () => {
    expect(validarCandidato({ ...candidatoOk(), severidade: 'urgente' }).join(' ')).toMatch(
      /severidade/
    );
  });
});

describe('rodarVertentes', () => {
  it('anexa vertente e versão aos candidatos válidos', () => {
    const r = rodarVertentes({}, [vertenteOk()]);
    expect(r.candidatos).toHaveLength(1);
    expect(r.candidatos[0]).toMatchObject({ vertente: 'compras-repetidas', versao: 1 });
    expect(r.resumo['compras-repetidas']).toEqual({ candidatos: 1, descartados: 0, erro: null });
  });

  it('descarta candidato inválido e conta', () => {
    const ruim = { ...candidatoOk(), evidencias: [] };
    const r = rodarVertentes({}, [vertenteOk(() => [candidatoOk(), ruim])]);
    expect(r.candidatos).toHaveLength(1);
    expect(r.resumo['compras-repetidas'].descartados).toBe(1);
  });

  it('vertente que lança erro não derruba as outras', () => {
    const quebrada = {
      ...vertenteOk(() => {
        throw new Error('boom');
      }),
      nome: 'quebrada',
    };
    const r = rodarVertentes({}, [quebrada, vertenteOk()]);
    expect(r.candidatos).toHaveLength(1);
    expect(r.resumo.quebrada.erro).toBe('boom');
  });

  it('vertente com contrato inválido é pulada com erro', () => {
    const r = rodarVertentes({}, [{ nome: 'x' }]);
    expect(r.candidatos).toHaveLength(0);
    expect(r.resumo.x.erro).toMatch(/contrato/);
  });
});
