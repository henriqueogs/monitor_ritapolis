'use strict';

const { motivoNaoAnalisavel, mascararCpf, filtrarAnalisaveis } = require('./selecao');

const PJ = '20495149000104';

describe('motivoNaoAnalisavel', () => {
  it.each([
    ['FOLHA PAGAMENTO 13º SALARIO PREFEITURA', 'folha'],
    ['INSS-INSTITUTO NACIONAL SEGURO SOCIAL', 'previdencia'],
    ['ASS. DE PAIS E AMIGOS EXCEPC. DE RITAPOLIS MG', 'entidade'],
    ['ASSOCIACAO COMERCIAL DE RITAPOLIS', 'entidade'],
    ['FUNDACAO ESTADUAL DE CULTURA', 'entidade'],
    ['CONSORCIO INTERMUNICIPAL DE SAUDE', 'entidade'],
  ])('exclui %s', (nome, motivo) => {
    expect(motivoNaoAnalisavel({ nome, cnpj: PJ })).toBe(motivo);
  });

  it('exclui credor sem CNPJ de 14 dígitos (pessoa física)', () => {
    expect(motivoNaoAnalisavel({ nome: 'FULANO DE TAL', cnpj: '12345678901' })).toBe(
      'pessoa_fisica'
    );
  });

  it('aceita fornecedor comum', () => {
    expect(motivoNaoAnalisavel({ nome: 'RLM PEÇAS PARA VEÍCULOS LTDA', cnpj: PJ })).toBeNull();
    expect(motivoNaoAnalisavel({ nome: 'ASSISTENCIA TECNICA LTDA', cnpj: PJ })).toBeNull();
  });
});

describe('mascararCpf', () => {
  it('troca CPF solto ou formatado, sem tocar em CNPJ ou valores', () => {
    expect(mascararCpf('ELANILSON SANTOS 53014731668 - ME')).toBe('ELANILSON SANTOS *** - ME');
    expect(mascararCpf('CPF 530.147.316-68 pago')).toBe('CPF *** pago');
    expect(mascararCpf('CNPJ 18855014000152 e R$ 1.463.649,73')).toBe(
      'CNPJ 18855014000152 e R$ 1.463.649,73'
    );
  });

  it('aceita nulo', () => {
    expect(mascararCpf(null)).toBe('');
  });
});

describe('filtrarAnalisaveis', () => {
  it('mantém a ordem e respeita o limite', () => {
    const lista = [
      { nome: 'FOLHA PAGAMENTO', cnpj: PJ },
      { nome: 'A LTDA', cnpj: PJ },
      { nome: 'ASS. DE PAIS', cnpj: PJ },
      { nome: 'B LTDA', cnpj: PJ },
      { nome: 'C LTDA', cnpj: PJ },
    ];
    expect(filtrarAnalisaveis(lista, 2).map(c => c.nome)).toEqual(['A LTDA', 'B LTDA']);
  });
});
