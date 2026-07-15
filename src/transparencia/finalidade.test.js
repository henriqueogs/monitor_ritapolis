'use strict';

const { classificarFinalidadeDespesa, FINALIDADES, getFinalidadeMeta } = require('./finalidade');

function despesa(base = {}) {
  return {
    id: 1,
    tipo: 'EO - Empenho Ordinario',
    credor_nome: 'FORNECEDOR X',
    credor_cnpj: '12345678000190',
    categoria_economica: '3.3.90.30.00 - MATERIAL DE CONSUMO',
    historico: 'AQUISICAO DE MATERIAL',
    ...base,
  };
}

describe('finalidade de empenhos', () => {
  it('tem metadados para todas as classes publicas', () => {
    expect(Object.keys(FINALIDADES)).toEqual(expect.arrayContaining([
      'ordem_pagamento',
      'licitacao',
      'diaria_servidor',
      'transferencia_entidade',
      'pessoal_encargos',
      'auxilio_pf',
      'servico_pf',
      'servico_pj_sem_licitacao',
      'investimento',
      'outros',
    ]));
  });

  it('classifica ordem de pagamento antes de qualquer outra regra', () => {
    const c = classificarFinalidadeDespesa(despesa({
      tipo: 'OP - Ordem de Pagamento',
      documento_id: 10,
      modalidade: 'Pregao - 00012026',
    }));

    expect(c.classe_principal).toBe('ordem_pagamento');
    expect(c.evidencias[0].campo).toBe('tipo');
  });

  it('classifica licitacao por documento/modalidade com precedencia sobre servico PJ', () => {
    const c = classificarFinalidadeDespesa(despesa({
      documento_id: 10,
      modalidade: 'Pregao - 00012026',
      licitacao_ref: '00000126 / 0',
      categoria_economica: '3.3.90.39.00 - OUTROS SERVICOS DE TERCEIROS - PESSOA JURIDICA',
    }));

    expect(c.classe_principal).toBe('licitacao');
    expect(c.subclasse).toBe('pregao');
    expect(c.marcadores).toEqual(expect.arrayContaining(['documento_vinculado', 'categoria:servicos-pj']));
  });

  it('classifica diaria de servidor por categoria e preserva cargo como evidencia', () => {
    const c = classificarFinalidadeDespesa(despesa({
      credor_cnpj: null,
      credor_cargo: 'MOTORISTA',
      categoria_economica: '3.3.90.14.00 - DIARIAS - CIVIL',
      historico: 'DIARIA PARA VIAGEM A JUIZ DE FORA',
    }));

    expect(c.classe_principal).toBe('diaria_servidor');
    expect(c.marcadores).toEqual(expect.arrayContaining(['cargo_credor', 'credor_pf_sem_cpf_publico']));
  });

  it('classifica repasse a entidade', () => {
    const c = classificarFinalidadeDespesa(despesa({
      credor_nome: 'ASS. DE PAIS E AMIGOS EXCEPC. DE RITAPOLIS MG',
      categoria_economica: '3.3.50.39.00 - OUTROS SERVICOS DE TERCEIROS - PESSOA JURIDICA',
      historico: 'REPASSE PARA A APAE CONFORME LEI MUNICIPAL',
    }));

    expect(c.classe_principal).toBe('transferencia_entidade');
  });

  it('classifica material sem licitacao como outros, mas marca a categoria', () => {
    const c = classificarFinalidadeDespesa(despesa());

    expect(c.classe_principal).toBe('outros');
    expect(c.subclasse).toBe('material');
    expect(c.marcadores).toEqual(expect.arrayContaining(['categoria:material']));
  });

  it('classifica indenizacao/restituicao pelo elemento 3.3.90.93', () => {
    const c = classificarFinalidadeDespesa(despesa({
      categoria_economica: '3.3.90.93.00 - INDENIZACOES E RESTITUICOES',
      historico: 'RESTITUICAO DE VALOR PAGO A MAIOR',
    }));

    expect(c.classe_principal).toBe('indenizacao_restituicao');
    expect(c.confianca).toBeGreaterThanOrEqual(0.85);
  });

  it('classifica sentenca judicial pelo elemento 3.3.90.91', () => {
    const c = classificarFinalidadeDespesa(despesa({
      categoria_economica: '3.3.90.91.00 - SENTENCAS JUDICIAIS',
    }));

    expect(c.classe_principal).toBe('sentenca_judicial');
  });

  it('classifica premiacao pelo elemento 3.3.90.31', () => {
    const c = classificarFinalidadeDespesa(despesa({
      categoria_economica: '3.3.90.31.00 - PREMIACOES CULT, CIENT, ARTIST, DESPORT, OUTR',
    }));

    expect(c.classe_principal).toBe('premiacao');
  });

  it('classifica distribuicao gratuita pelo elemento 3.3.90.32', () => {
    const c = classificarFinalidadeDespesa(despesa({
      categoria_economica: '3.3.90.32.00 - MATERIAL BEM OU SERVICO. P/ DISTRIB. GRATUITA',
    }));

    expect(c.classe_principal).toBe('distribuicao_gratuita');
  });

  it('classifica pessoal por texto de folha quando categoria nao e 3.1', () => {
    const c = classificarFinalidadeDespesa(despesa({
      categoria_economica: '3.3.90.47.00 - OBRIGACOES TRIBUTARIAS E CONTRIBUTIVAS',
      historico: 'PAGAMENTO FOLHA E OBRIGACOES PATRONAIS INSS',
    }));

    expect(c.classe_principal).toBe('pessoal_encargos');
    expect(c.regra).toBe('pessoal_categoria_ou_texto');
  });

  it('classifica auxilio por texto quando categoria nao e 3.3.90.48', () => {
    const c = classificarFinalidadeDespesa(despesa({
      categoria_economica: '3.3.90.18.00 - AUXILIO FINANCEIRO A ESTUDANTES',
      historico: 'AUXILIO TRANSPORTE ESCOLAR',
    }));

    expect(c.classe_principal).toBe('auxilio_pf');
  });

  it('classifica servico PF pelo elemento 3.3.90.36', () => {
    const c = classificarFinalidadeDespesa(despesa({
      categoria_economica: '3.3.90.36.00 - OUTROS SERVICOS DE TERCEIROS - PESSOA FISICA',
    }));

    expect(c.classe_principal).toBe('servico_pf');
  });

  it('classifica servico PJ sem licitacao pelo elemento 3.3.90.39', () => {
    const c = classificarFinalidadeDespesa(despesa({
      categoria_economica: '3.3.90.39.00 - OUTROS SERVICOS DE TERCEIROS - PESSOA JURIDICA',
    }));

    expect(c.classe_principal).toBe('servico_pj_sem_licitacao');
  });

  it('classifica investimento pelo grupo 4', () => {
    const c = classificarFinalidadeDespesa(despesa({
      categoria_economica: '4.4.90.52.00 - EQUIPAMENTOS E MATERIAL PERMANENTE',
    }));

    expect(c.classe_principal).toBe('investimento');
  });

  it('getFinalidadeMeta cai em outros para classe desconhecida', () => {
    expect(getFinalidadeMeta('inexistente')).toBe(FINALIDADES.outros);
  });

  it('deriva subclasse de modalidade nao padronizada via slug', () => {
    const c = classificarFinalidadeDespesa(despesa({
      documento_id: null,
      modalidade: 'Chamamento Publico - 0007/2026',
      categoria_economica: '3.3.90.39.00 - OUTROS SERVICOS DE TERCEIROS - PESSOA JURIDICA',
    }));

    expect(c.classe_principal).toBe('licitacao');
    expect(c.subclasse).toMatch(/^chamamento_publico/);
  });
});
