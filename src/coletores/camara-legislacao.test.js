'use strict';

const fs = require('fs');
const path = require('path');
const {
  parseRegistrosLegislacao,
  parseTituloItem,
  extrairHtmlDaResposta,
  paraHttps,
} = require('./camara-legislacao');

function lerFixtureJson(nome) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '__fixtures__', nome), 'utf8'));
}

describe('camara-legislacao', () => {
  describe('extrairHtmlDaResposta', () => {
    it('extrai o HTML de dentro do envelope "001 - {...}"', () => {
      const envelope = `001 - ${JSON.stringify({ ORDER_BY: 'x', HTML: '<div>ok</div>' })}`;
      expect(extrairHtmlDaResposta(envelope)).toBe('<div>ok</div>');
    });

    it('retorna null quando a resposta nao segue o formato esperado', () => {
      expect(extrairHtmlDaResposta('<DIV>Nenhum resultado</DIV>')).toBeNull();
      expect(extrairHtmlDaResposta('')).toBeNull();
    });
  });

  describe('paraHttps', () => {
    it('troca http:// por https:// (a fonte gera link de anexo em http mesmo com o site em https)', () => {
      expect(paraHttps('http://sgc.ritapolis.mg.leg.br/?Download=1')).toBe('https://sgc.ritapolis.mg.leg.br/?Download=1');
    });

    it('nao mexe em URL ja https ou valor nulo', () => {
      expect(paraHttps('https://sgc.ritapolis.mg.leg.br/?Download=1')).toBe('https://sgc.ritapolis.mg.leg.br/?Download=1');
      expect(paraHttps(null)).toBeNull();
    });
  });

  describe('parseTituloItem', () => {
    it('extrai tipo, numero e exercicio de "Tipo - NUM / ANO"', () => {
      expect(parseTituloItem('Lei Ordinária - 1 / 1963')).toEqual({
        tipoLabel: 'Lei Ordinária', numero: '1', exercicio: 1963,
      });
    });

    it('retorna null pra titulo fora do formato', () => {
      expect(parseTituloItem('')).toBeNull();
      expect(parseTituloItem('sem separador nem ano')).toBeNull();
    });
  });

  describe('parseRegistrosLegislacao', () => {
    let registros;

    beforeAll(() => {
      const fixture = lerFixtureJson('camara-legislacao-exemplo.json');
      registros = parseRegistrosLegislacao(fixture.HTML);
    });

    it('processa os 3 itens do fragmento sem lancar excecao', () => {
      expect(registros).toHaveLength(3);
    });

    it('extrai o primeiro item (lei antiga, com anexo, autor nao informado vira null)', () => {
      const r = registros[0];
      expect(r.tipoLabel).toBe('Lei Ordinária');
      expect(r.tipo).toBe('lei_ordinaria');
      expect(r.numero).toBe('1');
      expect(r.exercicio).toBe(1963);
      expect(r.autor).toBeNull();
      expect(r.ementa).toBe('Adota o Código Tributário do Município de São João del-Rei.');
      expect(r.dataPublicacao).toBe('1963-11-04');
      expect(r.anexoUrl).toBe('https://sgc.ritapolis.mg.leg.br/?Download=19756');
      expect(r.anexoNome).toBe('Lei Nº 1, de 04 de Novembro de 1963.pdf');
    });

    it('extrai autor real quando informado (nao vira null)', () => {
      expect(registros[1].autor).toBe('Mesa Diretora 1990');
      expect(registros[1].tipo).toBe('lei_organica');
    });

    it('processa item sem anexo, sem autor e sem ementa (Ata) sem lancar excecao', () => {
      const r = registros[2];
      expect(r.tipoLabel).toBe('Ata Ordinária');
      expect(r.tipo).toBe('ata_ordinaria');
      expect(r.anexoUrl).toBeNull();
      expect(r.autor).toBeNull();
      expect(r.ementa).toBe('');
    });
  });
});
