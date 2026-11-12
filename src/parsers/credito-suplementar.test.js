'use strict';

const { parseCreditoSuplementar } = require('./credito-suplementar');

const art1 = valor =>
  `decreta: Art. 1o. - Fica aberto o Crédito Suplementar no valor total de ${valor} (texto por extenso), nas seguintes dotações.`;
const art2 = trecho =>
  `Art. 2o. - Como recursos a abertura de Crédito Suplementar no artigo primeiro deste decreto ${trecho}`;

describe('parseCreditoSuplementar', () => {
  describe('valor total', () => {
    it.each([
      ['R$ 12.524,34', 12524.34],
      ['R§ 12.524,34', 12524.34],
      ['RS 53.433,98', 53433.98],
      ['R$ 1 .518,00', 1518],
      ['R$ 31 .202,93', 31202.93],
    ])('lê %s mesmo com erro de OCR', (bruto, esperado) => {
      expect(parseCreditoSuplementar(art1(bruto)).valorTotal).toBe(esperado);
    });

    it('devolve null sem a frase do valor total', () => {
      expect(parseCreditoSuplementar('Decreto qualquer sem valor').valorTotal).toBeNull();
      expect(parseCreditoSuplementar(null).valorTotal).toBeNull();
    });
  });

  describe('fonte do recurso', () => {
    it('anulação de dotações, mesmo com OCR ruim', () => {
      const t = art2(
        'fica anulado o valor de R$ 122.5t4,00 (...), referente a anrúaçáo parcial ou total das'
      );
      expect(parseCreditoSuplementar(t).fonte).toBe('anulacao');
    });

    it('superávit financeiro', () => {
      const t = art2(
        'frca utilizado o valor de R$ 2.341,80, proveniente ao Superávit financeiro (Art. 8)'
      );
      expect(parseCreditoSuplementar(t).fonte).toBe('superavit');
    });

    it('excesso de arrecadação', () => {
      const t = art2(
        'Íica utllizado o valor de R$ 11.570,00, proveniente ao Excesso de anecadação verificado'
      );
      expect(parseCreditoSuplementar(t).fonte).toBe('excesso');
    });

    it('misto quando cita mais de uma fonte', () => {
      const t = art2(
        'fica anulado o valor de R$ 1,00 e utilizado o Superávit financeiro de R$ 2,00'
      );
      expect(parseCreditoSuplementar(t).fonte).toBe('misto');
    });

    it('null quando não há trecho de recursos legível', () => {
      expect(parseCreditoSuplementar(art1('R$ 10,00')).fonte).toBeNull();
    });
  });
});
