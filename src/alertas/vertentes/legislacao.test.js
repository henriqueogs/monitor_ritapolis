'use strict';

const vertente = require('./legislacao');
const { rodarVertentes, validarVertente } = require('./orquestrador');

const lei = (numero, ano, extra = {}) => ({
  id: numero,
  tipo: 'lei_ordinaria',
  numero: String(numero),
  ano,
  data_publicacao: `${ano}-06-10`,
  url_origem: `https://fonte.example/lei/${numero}`,
  ...extra,
});
const norma = (id, texto, extra = {}) => ({
  id,
  tipo: 'lei_ordinaria',
  numero: String(id),
  ano: 2022,
  url_origem: `https://fonte.example/norma/${id}`,
  texto_completo: texto,
  ...extra,
});

describe('vertente legislacao', () => {
  it('cumpre o contrato', () => {
    expect(validarVertente(vertente)).toEqual([]);
  });

  describe('norma citada que não consta no acervo', () => {
    const leis = [lei(1600, 2022), lei(1601, 2022)];

    it('sinaliza lei municipal citada e ausente, com o trecho e o documento que cita', () => {
      const normas = [
        norma(1601, 'Altera a Lei Municipal nº 1.315, de 12 de março de 2014, que dispõe.'),
      ];
      const { candidatos, resumo } = rodarVertentes({ leis, normas }, [vertente]);
      expect(resumo.legislacao.erro).toBeNull();
      const [c] = candidatos.filter(x => x.alerta.subcategoria === 'legislacao_citada_ausente');
      expect(c.titulo).toContain('1.315/2014');
      expect(c.narrativa).toMatch(/não foi localizada no acervo/);
      expect(c.narrativa).toMatch(/não coletada|publicação/i);
      expect(c.evidencias[0]).toMatchObject({ url_origem: 'https://fonte.example/norma/1601' });
      expect(c.evidencias[0].trecho).toContain('1.315');
      expect(c.metrica).toMatchObject({ nome: 'normas_citadas_ausentes', valor: 1 });
    });

    it('agrupa várias normas que citam a mesma lei ausente em um só candidato', () => {
      const normas = [
        norma(1600, 'Conforme a Lei nº 1.315/2014.'),
        norma(1601, 'Nos termos da Lei Municipal nº 1315, de 12 de março de 2014.'),
      ];
      const lista = vertente
        .detectar({ leis, normas })
        .filter(x => x.alerta.subcategoria === 'legislacao_citada_ausente');
      expect(lista).toHaveLength(1);
      expect(lista[0].evidencias).toHaveLength(2);
    });

    it('não sinaliza lei que está no acervo, lei federal/estadual nem valor em reais', () => {
      const normas = [
        norma(
          1,
          'Lei nº 1.600, de 10 de junho de 2022, e Lei Federal nº 14.133, de 1º de abril de 2021.'
        ),
        norma(2, 'Crédito de R$ 1.670,00 e Lei nº 4.320, de 17 de março de 1964.'),
        norma(3, 'Lei Complementar nº 101, de 4 de maio de 2000.'),
      ];
      expect(vertente.detectar({ leis, normas })).toEqual([]);
    });
  });

  describe('lacuna de numeração no mandato corrente', () => {
    it('lista os números sem lei entre a primeira e a última do mandato, sem acusar', () => {
      const leis = [
        lei(1690, 2024),
        lei(1700, 2025),
        lei(1701, 2025),
        lei(1703, 2025),
        lei(1706, 2025),
      ];
      const [c] = vertente
        .detectar({ leis, normas: [] })
        .filter(x => x.alerta.subcategoria === 'legislacao_lacuna_numeracao');
      expect(c.metrica).toMatchObject({ nome: 'numeros_sem_lei', valor: 3 });
      expect(c.narrativa).toContain('1702');
      expect(c.narrativa).toContain('1704');
      expect(c.narrativa).toContain('1705');
      expect(c.narrativa).toMatch(/mandato 2025-2028/);
      expect(c.narrativa).not.toMatch(/fraude|irregular|ilegal|desvio/i);
      expect(c.evidencias.length).toBeGreaterThan(0);
      expect(c.evidencias.every(e => e.url_origem)).toBe(true);
    });

    it('não sinaliza numeração contínua nem leis de mandato anterior', () => {
      const leis = [lei(1600, 2022), lei(1605, 2022), lei(1700, 2025), lei(1701, 2025)];
      expect(
        vertente
          .detectar({ leis, normas: [] })
          .filter(x => x.alerta.subcategoria === 'legislacao_lacuna_numeracao')
      ).toEqual([]);
    });
  });
});
