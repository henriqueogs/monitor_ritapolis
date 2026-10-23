'use strict';

const { avaliarGateDeterministico, ehDeterministico, PREFIXO_CONFERIDO } = require('./gate-deterministico');

const CAMPOS = ['valor do contrato', 'aditivos'];

function alerta(extra = {}) {
  return {
    id: 217,
    qualidade_versao: 'execucao-contratual-v1',
    metadados: { campos_a_verificar: CAMPOS },
    ...extra,
  };
}

const SEM_PENDENCIA = { pendencias: [] };

describe('GateDeterministico', () => {
  describe('ehDeterministico', () => {
    it('reconhece alerta gerado por regra determinística', () => {
      expect(ehDeterministico(alerta())).toBe(true);
    });

    it('não vale para alertas da IA nem legados', () => {
      expect(ehDeterministico(alerta({ qualidade_versao: 'discovery-quality-v3' }))).toBe(false);
      expect(ehDeterministico({})).toBe(false);
    });
  });

  describe('avaliarGateDeterministico', () => {
    it('não se aplica a alerta não determinístico', () => {
      const r = avaliarGateDeterministico(alerta({ qualidade_versao: null }), SEM_PENDENCIA);

      expect(r).toEqual({ aplicavel: false, somenteAdmin: false, podePublicar: false, campos: [], faltando: [], bloqueio: null });
    });

    it('libera quando a revalidação não tem pendência e o revisor conferiu todos os campos', () => {
      // Act
      const r = avaliarGateDeterministico(alerta(), SEM_PENDENCIA, { conferidos: CAMPOS });

      // Assert
      expect(r.aplicavel).toBe(true);
      expect(r.podePublicar).toBe(true);
      expect(r.bloqueio).toBeNull();
    });

    it('bloqueia enquanto falta conferir algum campo', () => {
      const r = avaliarGateDeterministico(alerta(), SEM_PENDENCIA, { conferidos: ['valor do contrato'] });

      expect(r.podePublicar).toBe(false);
      expect(r.faltando).toEqual(['aditivos']);
      expect(r.bloqueio).toMatch(/aditivos/);
    });

    it('bloqueia quando a revalidação aponta pendência, mesmo com tudo conferido', () => {
      const revalidacao = { pendencias: [{ codigo: 'SEM_FONTE', mensagem: 'sem link' }] };

      const r = avaliarGateDeterministico(alerta(), revalidacao, { conferidos: CAMPOS });

      expect(r.podePublicar).toBe(false);
      expect(r.bloqueio).toMatch(/sem link/);
    });

    it('ignora confirmação de campo que o alerta não pede', () => {
      const r = avaliarGateDeterministico(alerta(), SEM_PENDENCIA, { conferidos: ['outro', 'aditivos'] });

      expect(r.faltando).toEqual(['valor do contrato']);
    });

    it('sem campos a verificar, exige ao menos a conferência do achado', () => {
      const semCampos = alerta({ metadados: {} });

      expect(avaliarGateDeterministico(semCampos, SEM_PENDENCIA).campos).toEqual(['achado conferido nas fontes']);
    });
  });

  describe('alerta somente admin (dados pessoais)', () => {
    const interno = alerta({ qualidade_versao: 'socio-servidor-v1', metadados: { somente_admin: true, campos_a_verificar: CAMPOS } });

    it('é determinístico, mas nunca pode ser publicado', () => {
      const r = avaliarGateDeterministico(interno, SEM_PENDENCIA, { conferidos: CAMPOS });

      expect(ehDeterministico(interno)).toBe(true);
      expect(r).toMatchObject({ aplicavel: true, somenteAdmin: true, podePublicar: false });
      expect(r.bloqueio).toMatch(/interno/i);
    });

    it('a marca somente_admin basta para cair no gate (mesmo sem versão conhecida)', () => {
      expect(ehDeterministico({ metadados: { somente_admin: true } })).toBe(true);
    });

    it('a marca somente_admin bloqueia qualquer versão', () => {
      const marcado = alerta({ metadados: { somente_admin: true, campos_a_verificar: CAMPOS } });

      expect(avaliarGateDeterministico(marcado, SEM_PENDENCIA, { conferidos: CAMPOS }).podePublicar).toBe(false);
    });
  });

  it('expõe o prefixo usado no histórico', () => {
    expect(PREFIXO_CONFERIDO).toBe('CONFERIDO: ');
  });
});
