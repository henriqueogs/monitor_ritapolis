'use strict';

const vertente = require('./diarias');
const { rodarVertentes, validarVertente } = require('./orquestrador');

let seq = 0;
const diaria = (ano, mesDia, valor, beneficiario = 'pf-a', extra = {}) => {
  seq += 1;
  return {
    id: seq,
    empenho: `${String(seq).padStart(5, '0')}-000`,
    exercicio_orcamento: ano,
    tipo: 'EO',
    data_empenho: `${ano}-${mesDia}`,
    valor,
    credor_chave: beneficiario,
    categoria_economica: '3.3.90.14.00 - DIÁRIAS - CIVIL',
    ...extra,
  };
};

describe('vertente diarias', () => {
  beforeEach(() => {
    seq = 0;
  });

  it('cumpre o contrato', () => {
    expect(validarVertente(vertente)).toEqual([]);
  });

  describe('crescimento sob o mesmo regime legal (Lei 1.696/2025), no mesmo mandato', () => {
    const subcat = lista => lista.filter(c => c.alerta.subcategoria === 'diarias_crescimento');
    // Antes de abril/2025 vigorava outro regime: o que veio antes (valores altos em 2025) não
    // entra. Na janela 01/04 a 06/11: 2025 = 2 × 5.000; 2026 = 7 × 5.000. Depois de 06/11 de 2025
    // há mais uma, que não entra (o ano corrente ainda não chegou lá).
    const base = () => [
      diaria(2025, '01-10', 30000),
      diaria(2025, '02-10', 30000),
      ...['05-10', '09-10'].map(d => diaria(2025, d, 5000)),
      diaria(2025, '12-15', 5000),
      diaria(2026, '01-12', 1000),
      ...['04-12', '05-12', '06-12', '07-12', '08-12', '09-12', '11-06'].map(d =>
        diaria(2026, d, 5000)
      ),
    ];

    it('compara só a janela sob a lei e separa quantidade de empenhos do valor médio', () => {
      const { candidatos, resumo } = rodarVertentes({ empenhos: base() }, [vertente]);
      expect(resumo.diarias.erro).toBeNull();
      const [c] = subcat(candidatos);
      expect(c).toBeDefined();
      expect(c.periodo).toEqual({ inicio: '2026-04-01', fim: '2026-11-06' });
      expect(c.metrica).toMatchObject({
        nome: 'diarias_periodo',
        unidade: 'R$',
        valor: 35000,
        anterior: 10000,
        empenhos: 7,
        empenhos_anterior: 2,
        media: 5000,
        media_anterior: 5000,
      });
      expect(c.narrativa).toContain('01/04/2026 a 06/11/2026');
      expect(c.narrativa).toContain('mesmo período de 2025');
      expect(c.narrativa).toContain('Lei 1.696/2025');
      expect(c.narrativa).toMatch(/número de empenhos.*valor médio por empenho/s);
      expect(c.narrativa).toMatch(/mesmo mandato/);
      expect(c.evidencias[0].url_origem).toMatch(/^https?:\/\//);
    });

    it('não sinaliza alta pequena', () => {
      const e = [
        ...['05-10', '09-10', '10-10', '10-20'].map(d => diaria(2025, d, 5000)),
        ...['04-12', '05-12', '06-12', '08-12', '09-12'].map(d => diaria(2026, d, 5000)),
      ];
      expect(subcat(vertente.detectar({ empenhos: e }))).toEqual([]);
    });

    it('não compara anos de mandatos diferentes', () => {
      const e = [
        ...['05-10', '06-10'].map(d => diaria(2024, d, 5000)),
        ...['04-12', '05-12', '06-12', '07-12', '08-12', '09-12', '11-06'].map(d =>
          diaria(2025, d, 5000)
        ),
      ];
      expect(subcat(vertente.detectar({ empenhos: e }))).toEqual([]);
    });
  });

  describe('concentração entre beneficiários', () => {
    const vinte5 = () => [
      ...['a', 'b', 'c', 'd', 'e'].flatMap(b => [
        diaria(2025, '03-10', 5000, b),
        diaria(2025, '06-10', 5000, b),
      ]),
      ...Array.from({ length: 20 }, (_, i) => diaria(2025, '04-10', 1000, `x${i}`)),
    ];

    it('sinaliza quando poucos beneficiários concentram boa parte do valor, sem nomes', () => {
      const c = vertente
        .detectar({ empenhos: vinte5() })
        .find(x => x.alerta.subcategoria === 'diarias_concentracao');
      expect(c).toBeDefined();
      expect(c.metrica).toMatchObject({
        nome: 'concentracao_top5',
        beneficiarios: 25,
        valor: 70000,
      });
      expect(c.metrica.share).toBeCloseTo(0.71, 2);
      expect(c.narrativa).toContain('5 de 25 beneficiários');
      expect(c.periodo).toEqual({ inicio: '2025-01-01', fim: '2025-12-31' });
      const tudo = JSON.stringify(c);
      expect(tudo).not.toMatch(/credor_nome|pf-|"a"|x\d/);
    });

    it('concentração moderada (45%) não sinaliza: quem viaja a serviço tende a concentrar', () => {
      // 5 beneficiários com 5.000 cada (25.000) e 20 com 1.500 cada (30.000): top5 = 45,5%.
      const moderada = [
        ...['a', 'b', 'c', 'd', 'e'].map(b => diaria(2025, '03-10', 5000, b)),
        ...Array.from({ length: 20 }, (_, i) => diaria(2025, '04-10', 1500, `m${i}`)),
      ];
      expect(
        vertente
          .detectar({ empenhos: moderada })
          .filter(c => c.alerta.subcategoria === 'diarias_concentracao')
      ).toEqual([]);
    });

    it('não sinaliza com poucos beneficiários ou total baixo', () => {
      const poucos = ['a', 'b', 'c', 'd', 'e', 'f'].map(b => diaria(2025, '03-10', 20000, b));
      const baixo = Array.from({ length: 25 }, (_, i) =>
        diaria(2025, '03-10', i < 5 ? 500 : 10, `y${i}`)
      );
      expect(
        vertente
          .detectar({ empenhos: poucos })
          .filter(c => c.alerta.subcategoria === 'diarias_concentracao')
      ).toEqual([]);
      expect(
        vertente
          .detectar({ empenhos: baixo })
          .filter(c => c.alerta.subcategoria === 'diarias_concentracao')
      ).toEqual([]);
    });
  });

  it('só conta empenhos originais de diárias', () => {
    const e = [
      ...Array.from({ length: 25 }, (_, i) => diaria(2025, '03-10', 5000, `z${i}`, { tipo: 'EE' })),
      ...Array.from({ length: 25 }, (_, i) =>
        diaria(2025, '03-10', 5000, `w${i}`, { categoria_economica: '3.3.90.30' })
      ),
    ];
    expect(vertente.detectar({ empenhos: e })).toEqual([]);
  });

  it('linguagem sem acusação e sem pessoa nomeada', () => {
    const cs = vertente.detectar({
      empenhos: [
        ...Array.from({ length: 8 }, (_, i) => diaria(2026, `0${i + 1}-10`, 6000, `p${i}`)),
        ...['01-10', '02-10'].map(d => diaria(2025, d, 6000)),
      ],
    });
    for (const c of cs) {
      expect(`${c.titulo} ${c.narrativa}`).not.toMatch(/fraude|desvio|irregular|ilegal|abuso/i);
    }
  });
});
