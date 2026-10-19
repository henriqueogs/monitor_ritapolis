'use strict';

const {
  rodarEvalGeracao,
  compararRelatorios,
  formatarRelatorioGeracao,
  formatarComparacao,
  MINIMOS_GERACAO,
  MAXIMOS_GERACAO,
} = require('./eval-geracao');
const { verificarLimiares } = require('./eval-recuperacao');
const { criarLLMSimulado } = require('./llm-simulado');

const dataset = [
  { id: 'a', pergunta: 'pa', fontes_esperadas: [1], fatos_obrigatorios: ['Alimentos Minas'] },
  { id: 'b', pergunta: 'pb', fontes_esperadas: [], deve_recusar: true },
];

const chunkA = {
  id: 'c1',
  docId: 1,
  texto: 'A empresa Alimentos Minas Ltda venceu o pregão eletrônico número um.',
  url_origem: 'https://x/1',
  score: 0.9,
};
const chunkFraco = {
  id: 'c9',
  docId: 7,
  texto: 'Decreto do feriado.',
  url_origem: 'https://x/7',
  score: 0.05,
};

const recuperar = jest.fn(async pergunta => (pergunta === 'pa' ? [chunkA] : [chunkFraco]));

async function rodar(comportamento, extra = {}) {
  const llm = criarLLMSimulado({ comportamento });
  const relatorio = await rodarEvalGeracao({ dataset, recuperar, llm, ...extra });
  return { llm, relatorio };
}

describe('rodarEvalGeracao', () => {
  beforeEach(() => recuperar.mockClear());

  it('LLM fiel: tudo fundamentado, sem alucinação, recusa onde não há evidência', async () => {
    const { relatorio } = await rodar('fiel');

    expect(relatorio.resumo).toMatchObject({
      n: 2,
      n_respondidas: 1,
      recusa_correta_pct: 1,
      fundamentacao_ok_pct: 1,
      citacao_valida_pct: 1,
      alucinacao_pct: 0,
      cobertura_fatos_medio: 1,
      linguagem_acusatoria_pct: 0,
      malformadas: 0,
    });
  });

  it('pergunta sem evidência (score abaixo do limiar) recusa SEM chamar o LLM', async () => {
    const llm = criarLLMSimulado({ comportamento: 'fiel' });
    const espiao = jest.spyOn(llm, 'generateJson');

    await rodarEvalGeracao({ dataset, recuperar, llm });

    expect(espiao).toHaveBeenCalledTimes(1); // só a pergunta 'a'
  });

  it('só chunks acima do limiar de evidência viram contexto, com url_origem por chunk', async () => {
    const llm = criarLLMSimulado({ comportamento: 'fiel' });
    const espiao = jest.spyOn(llm, 'generateJson');

    await rodarEvalGeracao({ dataset: [dataset[0]], recuperar, llm });

    const [{ prompt }] = espiao.mock.calls[0];
    expect(prompt).toContain('id=1 url=https://x/1');
    expect(prompt).not.toContain('Decreto do feriado');
  });

  it('LLM que inventa documento, valor e fonte é pego como alucinação', async () => {
    const { relatorio } = await rodar('alucina');

    expect(relatorio.resumo.alucinacao_pct).toBe(1);
    expect(relatorio.resumo.citacao_valida_pct).toBe(0);
    expect(relatorio.perguntas[0].numeros_inventados.length).toBeGreaterThan(0);
  });

  it('resposta sem citação reprova a fundamentação (citar ou recusar)', async () => {
    const { relatorio } = await rodar('sem_citacao');

    expect(relatorio.resumo.fundamentacao_ok_pct).toBe(0);
    expect(relatorio.resumo.alucinacao_pct).toBe(1);
  });

  it('LLM que sempre recusa erra a pergunta respondível (recusa incorreta)', async () => {
    const { relatorio } = await rodar('sempre_recusa');

    expect(relatorio.resumo.recusa_correta_pct).toBe(0.5);
    expect(relatorio.resumo.n_respondidas).toBe(0);
  });

  it('linguagem acusatória é contada', async () => {
    const { relatorio } = await rodar('acusatorio');

    expect(relatorio.resumo.linguagem_acusatoria_pct).toBe(1);
  });

  it('resposta fora do contrato vira "malformada" e não derruba a rodada', async () => {
    const { relatorio } = await rodar('malformado');

    expect(relatorio.resumo.malformadas).toBe(1);
    expect(relatorio.perguntas[0]).toMatchObject({ malformada: true, recusa_correta: false });
  });

  it('falha do provedor (ex.: 429) aborta a rodada em vez de virar nota', async () => {
    const llm = {
      provider: 'x',
      model: 'm',
      generateJson: async () => {
        throw new Error('429');
      },
    };

    await expect(rodarEvalGeracao({ dataset, recuperar, llm })).rejects.toThrow('429');
  });

  it('o relatório identifica prompt e modelo para comparação antes/depois', async () => {
    const { relatorio } = await rodar('fiel');

    expect(relatorio.meta).toMatchObject({ modelo: 'llm-simulado' });
    expect(relatorio.meta.prompt_versao).toEqual(expect.any(String));
  });
});

describe('gate de geração (limiares do ADR 0006)', () => {
  it('LLM fiel passa nos mínimos e máximos', async () => {
    const { relatorio } = await rodar('fiel');

    expect(verificarLimiares(relatorio.resumo, MINIMOS_GERACAO, MAXIMOS_GERACAO)).toEqual({
      passou: true,
      falhas: [],
    });
  });

  it.each(['alucina', 'sem_citacao', 'acusatorio', 'malformado', 'sempre_recusa'])(
    'comportamento %s reprova o gate',
    async comportamento => {
      const { relatorio } = await rodar(comportamento);

      expect(verificarLimiares(relatorio.resumo, MINIMOS_GERACAO, MAXIMOS_GERACAO).passou).toBe(
        false
      );
    }
  );
});

describe('compararRelatorios (antes/depois)', () => {
  it('aponta regressões: troca de um LLM fiel por um que alucina', async () => {
    const antes = (await rodar('fiel')).relatorio;
    const depois = (await rodar('alucina')).relatorio;

    const c = compararRelatorios(antes, depois);

    expect(c.regressoes).toEqual(expect.arrayContaining(['alucinacao_pct', 'citacao_valida_pct']));
    expect(c.metricas.alucinacao_pct).toMatchObject({ antes: 0, depois: 1, status: 'piorou' });
  });

  it('melhoria e estabilidade (dentro da tolerância) não são regressão', async () => {
    const ruim = (await rodar('alucina')).relatorio;
    const bom = (await rodar('fiel')).relatorio;

    const melhora = compararRelatorios(ruim, bom);
    const igual = compararRelatorios(bom, bom);

    expect(melhora.regressoes).toEqual([]);
    expect(melhora.metricas.alucinacao_pct.status).toBe('melhorou');
    expect(igual.regressoes).toEqual([]);
    expect(igual.metricas.recusa_correta_pct.status).toBe('igual');
  });

  it('métrica que existia e sumiu (null) conta como piora, não como empate', () => {
    const c = compararRelatorios(
      { resumo: { citacao_valida_pct: 1 }, meta: {} },
      { resumo: { citacao_valida_pct: null }, meta: {} }
    );

    expect(c.regressoes).toContain('citacao_valida_pct');
  });
});

describe('formatação', () => {
  it('relatório lista o resumo e as perguntas com problema', async () => {
    const { relatorio } = await rodar('alucina');

    const texto = formatarRelatorioGeracao(relatorio);

    expect(texto).toContain('alucinacao_pct');
    expect(texto).toContain('a');
    expect(texto).toMatch(/doc_fora_do_contexto/);
  });

  it('comparação mostra antes, depois e o status de cada métrica', async () => {
    const antes = (await rodar('fiel')).relatorio;
    const depois = (await rodar('alucina')).relatorio;

    const texto = formatarComparacao(compararRelatorios(antes, depois));

    expect(texto).toContain('| alucinacao_pct |');
    expect(texto).toContain('piorou');
    expect(texto).toMatch(/regress/i);
  });
});
