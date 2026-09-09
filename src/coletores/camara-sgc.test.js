'use strict';

const fs = require('fs');
const path = require('path');
const {
  parseTituloProjeto,
  parseProjetos,
  parseVereadores,
  parseMandatos,
} = require('./camara-sgc');

function lerFixtureJson(nome) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '__fixtures__', nome), 'utf8'));
}

function lerFixtureTexto(nome) {
  return fs.readFileSync(path.join(__dirname, '__fixtures__', nome), 'utf8');
}

describe('camara-sgc', () => {
  describe('parseTituloProjeto', () => {
    it('extrai INT_PRJT, tipo e numero de "ID - Tipo - NUM"', () => {
      expect(parseTituloProjeto('6968 - Projeto de Lei - 8')).toEqual({
        intPrjt: 6968, tipoLabel: 'Projeto de Lei', numero: '8',
      });
    });

    it('retorna null pra titulo fora do formato', () => {
      expect(parseTituloProjeto('')).toBeNull();
      expect(parseTituloProjeto('sem separador')).toBeNull();
    });
  });

  describe('parseProjetos', () => {
    let registros;

    beforeAll(() => {
      const fixture = lerFixtureJson('camara-projetos-exemplo.json');
      registros = parseProjetos(fixture.HTML);
    });

    it('processa os 4 itens do fragmento sem lancar excecao', () => {
      expect(registros).toHaveLength(4);
    });

    it('extrai o primeiro item (Projeto de Lei, com anexo)', () => {
      const r = registros[0];
      expect(r.intPrjt).toBe(6968);
      expect(r.cOrg).toBe('P');
      expect(r.tipoLabel).toBe('Projeto de Lei');
      expect(r.tipo).toBe('projeto_lei');
      expect(r.numero).toBe('8');
      expect(r.exercicio).toBe(2025);
      expect(r.autorTexto).toBe('Prefeito Antônio Ronato de Melo');
      expect(r.situacao).toBe('Em tramitação');
      expect(r.localizacao).toBe('Rascunho');
      expect(r.anexoUrl).toBe('https://sgc.ritapolis.mg.leg.br/?Download=55491');
      expect(r.anexoNome).toBe('Projeto de Lei nº 8, de 23 de janeiro de 2025..pdf');
    });

    it('reconhece Projeto de Lei Complementar', () => {
      expect(registros[2].tipoLabel).toBe('Projeto de Lei Complementar');
      expect(registros[2].numero).toBe('4');
    });

    it('processa item sem anexo e sem ementa (Projeto de Resolução) sem lancar excecao', () => {
      const r = registros[3];
      expect(r.intPrjt).toBe(7001);
      expect(r.tipoLabel).toBe('Projeto de Resolução');
      expect(r.autorTexto).toBe('Mesa Diretora');
      expect(r.ementa).toBe('');
      expect(r.anexoUrl).toBeNull();
      expect(r.anexoNome).toBeNull();
    });
  });

  describe('parseVereadores', () => {
    let registros;

    beforeAll(() => {
      registros = parseVereadores(lerFixtureTexto('camara-vereadores-exemplo.html'));
    });

    it('extrai os 5 vereadores do fragmento real', () => {
      expect(registros).toHaveLength(5);
    });

    it('extrai INT_PES e nome com acentuacao correta', () => {
      expect(registros).toContainEqual({ intPes: 1125, nome: 'Bruno Amaral Santos' });
      expect(registros).toContainEqual({ intPes: 995, nome: 'Gustavo Jr. Assis da Paixão' });
      expect(registros).toContainEqual({ intPes: 487, nome: 'Totó do Sabiá' });
    });

    it('retorna lista vazia pra fragmento sem itens', () => {
      expect(parseVereadores('')).toEqual([]);
    });
  });

  describe('parseMandatos', () => {
    it('extrai multiplos mandatos (vereador que trocou de partido)', () => {
      const registros = parseMandatos(lerFixtureTexto('camara-mandatos-exemplo.html'));
      expect(registros).toEqual([
        { periodoInicio: 2025, periodoFim: 2028, partido: 'PSB' },
        { periodoInicio: 2021, periodoFim: 2024, partido: 'PSDB' },
      ]);
    });

    it('retorna lista vazia pra INT_PES sem mandato', () => {
      expect(parseMandatos('<table></table>')).toEqual([]);
    });
  });
});
