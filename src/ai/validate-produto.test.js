'use strict';

const { interpretarVeredito, buildValidacaoProdutoPrompt } = require('./validate-produto');

describe('ai/validate-produto · interpretarVeredito', () => {
  it('confere=sim → validado', () => {
    expect(interpretarVeredito({ confere: 'sim', motivo: 'bate' })).toEqual({
      status: 'validado',
      motivo: 'bate',
    });
  });

  it('confere=nao → rejeitado', () => {
    expect(interpretarVeredito({ confere: 'nao', motivo: 'valor difere' }).status).toBe('rejeitado');
  });

  it('confere=parcial → pendente (precisa humano)', () => {
    expect(interpretarVeredito({ confere: 'parcial', motivo: 'só parte' }).status).toBe('pendente');
  });

  it('tolera acentos e maiúsculas ("Não", "SIM")', () => {
    expect(interpretarVeredito({ confere: 'Não' }).status).toBe('rejeitado');
    expect(interpretarVeredito({ confere: 'SIM' }).status).toBe('validado');
  });

  it('resposta desconhecida/vazia → pendente (conservador)', () => {
    expect(interpretarVeredito({ confere: 'talvez' }).status).toBe('pendente');
    expect(interpretarVeredito({}).status).toBe('pendente');
    expect(interpretarVeredito(null).status).toBe('pendente');
  });

  it('motivo ausente vira string vazia', () => {
    expect(interpretarVeredito({ confere: 'sim' }).motivo).toBe('');
  });
});

describe('ai/validate-produto · buildValidacaoProdutoPrompt', () => {
  const produto = {
    descricao: 'Gasolina comum',
    unidade: 'Litros',
    quantidade: 1000,
    valor_unitario_final: 5.9,
    fornecedor_nome: 'POSTO MAVI LTDA',
    trecho_fonte: 'Item 1 - Gasolina comum - 1000 L - R$ 5,90 - POSTO MAVI',
  };

  it('inclui os campos extraídos e o trecho da fonte', () => {
    const p = buildValidacaoProdutoPrompt(produto);
    expect(p).toContain('Gasolina comum');
    expect(p).toContain('POSTO MAVI');
    expect(p).toContain('1000 L - R$ 5,90');
  });

  it('pede JSON com o campo confere', () => {
    const p = buildValidacaoProdutoPrompt(produto);
    expect(p.toLowerCase()).toContain('confere');
    expect(p).toMatch(/json/i);
  });
});
