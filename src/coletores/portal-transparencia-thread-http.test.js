'use strict';

const { paraFormatoBr, paraFormatoIso } = require('./portal-transparencia-thread-http');

describe('portal-transparencia-thread-http', () => {
  describe('paraFormatoBr', () => {
    it('converte ISO (aaaa-mm-dd) para o formato do formulário (dd/mm/aaaa)', () => {
      expect(paraFormatoBr('2025-01-07')).toBe('07/01/2025');
    });
  });

  describe('paraFormatoIso', () => {
    it('converte dd/mm/aaaa para ISO', () => {
      expect(paraFormatoIso('07/01/2025')).toBe('2025-01-07');
    });

    it('retorna null para valor vazio', () => {
      expect(paraFormatoIso('')).toBeNull();
      expect(paraFormatoIso(null)).toBeNull();
    });
  });
});
