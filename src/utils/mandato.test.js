'use strict';

const { mandatoInicio, mandatoLabel, agruparPorMandato } = require('./mandato');

describe('mandato', () => {
  describe('mandatoInicio', () => {
    it('mapeia anos do mandato 2025-2028', () => {
      expect(mandatoInicio(2025)).toBe(2025);
      expect(mandatoInicio(2026)).toBe(2025);
      expect(mandatoInicio(2028)).toBe(2025);
    });

    it('mapeia anos do mandato 2021-2024', () => {
      expect(mandatoInicio(2021)).toBe(2021);
      expect(mandatoInicio(2023)).toBe(2021);
      expect(mandatoInicio(2024)).toBe(2021);
    });

    it('mapeia mandatos mais antigos', () => {
      expect(mandatoInicio(2020)).toBe(2017);
      expect(mandatoInicio(2017)).toBe(2017);
      expect(mandatoInicio(2016)).toBe(2013);
    });

    it('aceita ano como string numérica', () => {
      expect(mandatoInicio('2026')).toBe(2025);
    });
  });

  describe('mandatoLabel', () => {
    it('formata intervalo de 4 anos', () => {
      expect(mandatoLabel(2025)).toBe('2025-2028');
      expect(mandatoLabel(2021)).toBe('2021-2024');
    });
  });

  describe('agruparPorMandato', () => {
    const rows = [
      { ano: 2023, n_empenhos: 10, valor_total: 100 },
      { ano: 2024, n_empenhos: 20, valor_total: 200 },
      { ano: 2025, n_empenhos: 30, valor_total: 300 },
      { ano: 2026, n_empenhos: 40, valor_total: 400 },
    ];

    it('agrupa anos no mandato correto e soma campos', () => {
      const grupos = agruparPorMandato(rows, {
        camposSoma: ['n_empenhos', 'valor_total'],
        anoAtual: 2026,
      });

      expect(grupos).toHaveLength(2);
      const [atual, anterior] = grupos;

      expect(atual.mandato).toBe('2025-2028');
      expect(atual.inicio).toBe(2025);
      expect(atual.fim).toBe(2028);
      expect(atual.anos).toEqual([2025, 2026]);
      expect(atual.n_empenhos).toBe(70);
      expect(atual.valor_total).toBe(700);

      expect(anterior.mandato).toBe('2021-2024');
      expect(anterior.anos).toEqual([2023, 2024]);
      expect(anterior.n_empenhos).toBe(30);
      expect(anterior.valor_total).toBe(300);
    });

    it('ordena mandatos do mais recente para o mais antigo', () => {
      const grupos = agruparPorMandato(rows, { anoAtual: 2026 });
      expect(grupos.map((g) => g.inicio)).toEqual([2025, 2021]);
    });

    it('marca em_curso apenas no mandato que contém o ano atual', () => {
      const grupos = agruparPorMandato(rows, { anoAtual: 2026 });
      expect(grupos.find((g) => g.inicio === 2025).em_curso).toBe(true);
      expect(grupos.find((g) => g.inicio === 2021).em_curso).toBe(false);
    });

    it('expõe anos reais presentes nos dados (mandato parcial)', () => {
      const grupos = agruparPorMandato(rows, { anoAtual: 2026 });
      const anterior = grupos.find((g) => g.inicio === 2021);
      // 2021 e 2022 não estão nos dados — UI pode rotular "parcial"
      expect(anterior.anos).toEqual([2023, 2024]);
    });

    it('aceita anoKey customizado (exercicio)', () => {
      const grupos = agruparPorMandato(
        [{ exercicio: 2025, valor: 5 }],
        { anoKey: 'exercicio', camposSoma: ['valor'], anoAtual: 2026 }
      );
      expect(grupos).toHaveLength(1);
      expect(grupos[0].mandato).toBe('2025-2028');
      expect(grupos[0].valor).toBe(5);
    });

    it('ignora rows sem ano numérico', () => {
      const grupos = agruparPorMandato(
        [{ ano: null, valor: 1 }, { ano: 2026, valor: 2 }],
        { camposSoma: ['valor'], anoAtual: 2026 }
      );
      expect(grupos).toHaveLength(1);
      expect(grupos[0].valor).toBe(2);
    });

    it('retorna lista vazia para entrada vazia', () => {
      expect(agruparPorMandato([], { anoAtual: 2026 })).toEqual([]);
      expect(agruparPorMandato(null, { anoAtual: 2026 })).toEqual([]);
    });

    it('trata campo de soma ausente como 0', () => {
      const grupos = agruparPorMandato(
        [{ ano: 2025 }, { ano: 2026, valor: 3 }],
        { camposSoma: ['valor'], anoAtual: 2026 }
      );
      expect(grupos[0].valor).toBe(3);
    });
  });

describe('exerciciosDoMandato', () => {
  const { exerciciosDoMandato } = require('./mandato');

  it('devolve os 4 anos do mandato que contém o ano', () => {
    expect(exerciciosDoMandato(2026)).toEqual([2025, 2026, 2027, 2028]);
    expect(exerciciosDoMandato(2024)).toEqual([2021, 2022, 2023, 2024]);
  });
});
});

describe('resolverExercicios / montarPeriodo (fonte unica do periodo)', () => {
  const { resolverExercicios, montarPeriodo, descreverMandato } = require('./mandato');

  it('exercicio explicito tem precedencia sobre mandato', () => {
    expect(resolverExercicios({ exercicio: 2024, mandato: 2026 })).toEqual([2024]);
  });

  it('mandato (qualquer ano dele) vira os 4 exercicios; fronteira 2024/2025', () => {
    expect(resolverExercicios({ mandato: 2024 })).toEqual([2021, 2022, 2023, 2024]);
    expect(resolverExercicios({ mandato: 2025 })).toEqual([2025, 2026, 2027, 2028]);
  });

  it('sem filtro ou filtro invalido devolve undefined (acumulado)', () => {
    expect(resolverExercicios()).toBeUndefined();
    expect(resolverExercicios({ mandato: 'abc', exercicio: -3 })).toBeUndefined();
  });

  it('montarPeriodo com exercicio invalido cai no mandato valido ou no acumulado', () => {
    expect(montarPeriodo({ exercicio: -3, mandato: 2026 }, [])).toMatchObject({ exercicio: null, mandato: { label: '2025-2028' } });
    expect(montarPeriodo({ exercicio: Number.NaN }, [])).toMatchObject({ exercicio: null, mandato: null });
    expect(montarPeriodo({ exercicio: 'abc', mandato: 'x' }, [])).toMatchObject({ exercicio: null, mandato: null });
  });

  it('mandato aceita QUALQUER ano dentro do mandato (nao so o inicio)', () => {
    expect(montarPeriodo({ mandato: 2027 }, []).mandato.label).toBe('2025-2028');
    expect(resolverExercicios({ mandato: 2028 })).toEqual([2025, 2026, 2027, 2028]);
  });

  it('resolverFiltroPeriodo informa o tipo do filtro aplicado', () => {
    const { resolverFiltroPeriodo } = require('./mandato');

    expect(resolverFiltroPeriodo({ exercicio: 2024, mandato: 2026 })).toEqual({ tipo: 'exercicio', exercicios: [2024] });
    expect(resolverFiltroPeriodo({ exercicio: -5, mandato: 2026 }).tipo).toBe('mandato');
    expect(resolverFiltroPeriodo({})).toEqual({ tipo: 'acumulado', exercicios: undefined });
  });

  it('descreverMandato rotula inicio, fim e label', () => {
    expect(descreverMandato(2025)).toEqual({ inicio: 2025, fim: 2028, label: '2025-2028' });
  });

  it('montarPeriodo: exercicio, mandato e acumulado, com anos cobertos pela serie', () => {
    const serie = [{ exercicio: 2025 }, { exercicio: 2023 }];

    expect(montarPeriodo({ exercicio: 2024 }, serie)).toEqual({
      exercicio: 2024,
      mandato: { inicio: 2021, fim: 2024, label: '2021-2024' },
      anos_cobertos: [2023, 2025],
    });
    expect(montarPeriodo({ mandato: 2026 }, serie)).toMatchObject({ exercicio: null, mandato: { label: '2025-2028' } });
    expect(montarPeriodo({}, serie)).toEqual({ exercicio: null, mandato: null, anos_cobertos: [2023, 2025] });
    expect(montarPeriodo({}, [])).toMatchObject({ anos_cobertos: [] });
  });
});
