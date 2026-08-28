'use strict';

const fs = require('fs');
const path = require('path');
const {
  extrairTokens,
  parseValorCsv,
  parseCsvDespesas,
  nomeCredorDoCsv,
  parseDetalhamentoDespesa,
} = require('./portal-transparencia-thread');

function lerFixture(nome) {
  return fs.readFileSync(path.join(__dirname, '__fixtures__', nome), 'utf8');
}

describe('portal-transparencia-thread', () => {
  describe('extrairTokens', () => {
    it('extrai SHA1_TOKEN e INT_TOKEN da página de busca real', () => {
      const html = lerFixture('despesa-form-exemplo.html');
      const tokens = extrairTokens(html);
      expect(tokens).toEqual({
        sha1Token: expect.stringMatching(/^[a-f0-9]{40}$/),
        intToken: expect.stringMatching(/^\d+$/),
      });
    });

    it('retorna null quando não encontra o padrão', () => {
      expect(extrairTokens('<html>sem tokens aqui</html>')).toBeNull();
    });
  });

  describe('parseValorCsv', () => {
    it('parseia número com ponto decimal', () => {
      expect(parseValorCsv(' 24.00')).toBe(24);
      expect(parseValorCsv(' 10000.00')).toBe(10000);
    });

    it('retorna null para "-" (campo não aplicável)', () => {
      expect(parseValorCsv(' -')).toBeNull();
      expect(parseValorCsv('')).toBeNull();
    });
  });

  describe('nomeCredorDoCsv', () => {
    it('remove o código interno, mantém só o nome', () => {
      expect(nomeCredorDoCsv('00003 - BANCO DO BRASIL S/A')).toBe('BANCO DO BRASIL S/A');
    });

    it('mantém o texto como está quando não bate o padrão código-nome', () => {
      expect(nomeCredorDoCsv('SEM CODIGO')).toBe('SEM CODIGO');
    });
  });

  describe('parseCsvDespesas', () => {
    let despesas;

    beforeAll(() => {
      const csv = lerFixture('despesa-exemplo.csv');
      despesas = parseCsvDespesas(csv);
    });

    it('ignora as linhas de ruído "Clique na lupa"', () => {
      expect(despesas.every((d) => !d.empenho.startsWith('Clique'))).toBe(true);
    });

    // Regressão: essas 3 linhas de rodapé (soma do relatório) foram
    // inseridas como se fossem despesas reais num teste manual contra
    // produção antes desse filtro existir — credor "0", valor de milhões
    // de reais num único "empenho" chamado "Total Geral (*)".
    it('ignora as linhas de rodapé de soma (Total Geral / Orçamentário / Extra-Orçamentário)', () => {
      const empenhos = despesas.map((d) => d.empenho);
      expect(empenhos).not.toContain('Total Geral (*)');
      expect(empenhos).not.toContain('Total Orçamentário');
      expect(empenhos).not.toContain('Total Extra-Orçamentário');
    });

    it('pula linhas tipo OP (colidem no mesmo empenho da linha EO)', () => {
      expect(despesas.every((d) => d.tipo !== 'OP')).toBe(true);
    });

    it('normaliza o número do empenho sem o sufixo "/ ano"', () => {
      expect(despesas[0].empenho).toBe('00001-000');
    });

    it('extrai nome do credor, datas e valor da linha EO', () => {
      const primeiro = despesas[0];
      expect(primeiro.credorNomeParcial).toBe('BANCO DO BRASIL S/A');
      expect(primeiro.tipo).toBe('EO');
      expect(primeiro.dataEmpenho).toBe('09/01/2025');
      expect(primeiro.valor).toBe(24);
    });

    it('processa todo o arquivo sem lançar exceção', () => {
      expect(despesas.length).toBeGreaterThan(0);
    });
  });

  describe('parseDetalhamentoDespesa', () => {
    let detalhe;

    beforeAll(() => {
      const html = lerFixture('despesa-detalhe-exemplo.html');
      detalhe = parseDetalhamentoDespesa(html);
    });

    it('extrai os campos ricos ausentes no CSV', () => {
      expect(detalhe.unidade).toContain('SECRETARIA MUNICIPAL DE FAZENDA');
      expect(detalhe.fonteDeRecurso).toContain('RECURSOS');
      expect(detalhe.coTce).toContain('0000');
      expect(detalhe.historico).toContain('TARIFAS BANCARIAS');
    });

    it('monta o credor no formato "NOME - CPF/CNPJ: xxx" (compatível com upsertDespesa)', () => {
      expect(detalhe.credor).toMatch(/^BANCO DO BRASIL S\/A - CPF\/CNPJ: [\d./-]+$/);
    });

    it('retorna null quando a página não tem o padrão esperado', () => {
      expect(parseDetalhamentoDespesa('<html>vazio</html>')).toBeNull();
    });
  });
});
