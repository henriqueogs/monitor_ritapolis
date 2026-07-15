'use strict';

const { classificarFinalidadeDespesa, FINALIDADES } = require('./finalidade');

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
});
