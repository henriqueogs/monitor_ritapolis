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

  describe('crescimento no mesmo período, dentro do mesmo mandato', () => {
    // 2025 até 06/11: 4 × 5.000; 2026 até 06/11: 8 × 5.000. Depois de 06/11 de 2025 há mais uma,
    // que não entra na comparação (o ano corrente ainda não chegou lá).
    const base = () => [
      ...['01-10', '03-10', '05-10', '09-10'].map(d => diaria(2025, d, 5000)),
      diaria(2025, '12-15', 5000),
      ...['01-12', '02-12', '03-12', '04-12', '05-12', '06-12', '08-12', '11-06'].map(d =>
        diaria(2026, d, 5000)
      ),
    ];

    it('sinaliza alta acima de 30% e R$ 20 mil, comparando o mesmo período do ano anterior', () => {
      const { candidatos, resumo } = rodarVertentes({ empenhos: base() }, [vertente]);
      expect(resumo.diarias.erro).toBeNull();
      const c = candidatos.find(x => x.alerta.subcategoria === 'diarias_crescimento');
      expect(c).toBeDefined();
      expect(c.periodo).toEqual({ inicio: '2026-01-01', fim: '2026-11-06' });
      expect(c.metrica).toMatchObject({
        nome: 'diarias_periodo',
        unidade: 'R$',
        valor: 40000,
        anterior: 20000,
      });
      expect(c.narrativa).toContain('01/01/2026 a 06/11/2026');
      expect(c.narrativa).toContain('mesmo período de 2025');
      expect(c.narrativa).toMatch(/mesmo mandato/);
      expect(c.evidencias.length).toBeGreaterThan(0);
      expect(c.evidencias[0].url_origem).toMatch(/^https?:\/\//);
    });

    it('não sinaliza alta pequena', () => {
      const e = [
        ...['01-10', '03-10', '05-10', '09-10'].map(d => diaria(2025, d, 5000)),
        ...['01-12', '03-12', '05-12', '09-12', '10-12'].map(d => diaria(2026, d, 5000)),
      ];
      expect(
        vertente
          .detectar({ empenhos: e })
          .filter(c => c.alerta.subcategoria === 'diarias_crescimento')
      ).toEqual([]);
    });

    it('não compara anos de mandatos diferentes', () => {
      const e = [
        ...['01-10', '03-10'].map(d => diaria(2024, d, 5000)),
        ...['01-12', '02-12', '03-12', '04-12', '05-12', '06-12', '08-12', '11-06'].map(d =>
          diaria(2025, d, 5000)
        ),
      ];
      expect(
        vertente
          .detectar({ empenhos: e })
          .filter(c => c.alerta.subcategoria === 'diarias_crescimento')
      ).toEqual([]);
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
    for (const c of cs)
      {expect(`${c.titulo} ${c.narrativa}`).not.toMatch(/fraude|desvio|irregular|ilegal|abuso/i);}
  });
});
