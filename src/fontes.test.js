'use strict';

const { montarFontes, fontes } = require('./fontes');

const CFG = {
  dominioSite: 'cidade-exemplo.invalid',
  dominioPrefeitura: 'prefeitura.exemplo.invalid',
  dominioCamara: 'camara.exemplo.invalid',
  portalTransparencia: 'https://transparencia.exemplo.invalid',
};

describe('fontes (endereços das fontes oficiais vindos da configuração)', () => {
  describe('montarFontes', () => {
    it('monta as origens a partir dos domínios do município', () => {
      // Act
      const resultado = montarFontes(CFG);

      // Assert
      expect(resultado).toMatchObject({
        site: 'https://cidade-exemplo.invalid',
        sitePrefeitura: 'https://prefeitura.exemplo.invalid',
        siteCamara: 'https://camara.exemplo.invalid',
        portalTransparencia: 'https://transparencia.exemplo.invalid',
      });
    });

    it('aceita o site com e sem www (o portal da Prefeitura responde pelos dois)', () => {
      expect(montarFontes(CFG).hostsPrefeitura).toEqual([
        'prefeitura.exemplo.invalid',
        'www.prefeitura.exemplo.invalid',
      ]);
      expect(montarFontes(CFG).hostsSite).toEqual([
        'cidade-exemplo.invalid',
        'www.cidade-exemplo.invalid',
      ]);
    });

    it('tira a barra final do portal (os coletores concatenam caminhos com "/")', () => {
      const resultado = montarFontes({ ...CFG, portalTransparencia: 'https://pt.x.invalid/' });

      expect(resultado.portalTransparencia).toBe('https://pt.x.invalid');
    });

    it('recusa portal que não é https', () => {
      expect(() => montarFontes({ ...CFG, portalTransparencia: 'http://pt.x.invalid' })).toThrow(
        /portalTransparencia/
      );
    });

    it('recusa domínio com protocolo ou caminho (o campo é só o host)', () => {
      expect(() => montarFontes({ ...CFG, dominioCamara: 'https://camara.x.invalid' })).toThrow(
        /dominioCamara/
      );
    });

    it('o resultado é imutável', () => {
      expect(Object.isFrozen(montarFontes(CFG))).toBe(true);
    });
  });

  describe('fontes (município padrão)', () => {
    it('sem MUNICIPIO, aponta para as fontes de Ritápolis', () => {
      expect(fontes).toMatchObject({
        site: 'https://ritapolis.com',
        sitePrefeitura: 'https://ritapolis.mg.gov.br',
        siteCamara: 'https://ritapolis.mg.leg.br',
        portalTransparencia: 'https://pt.ritapolis.mg.gov.br',
      });
    });
  });
});
