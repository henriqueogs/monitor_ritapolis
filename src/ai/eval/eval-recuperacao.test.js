'use strict';

const { rodarEvalRecuperacao, verificarLimiares, formatarRelatorio } = require('./eval-recuperacao');

const dataset = [
  { id: 'q1', pergunta: 'p1', fontes_esperadas: [1] },
  { id: 'q2', pergunta: 'p2', fontes_esperadas: [2, 3], filtros: { ano: 2025 } },
  { id: 'q3', pergunta: 'p3', deve_recusar: true, fontes_esperadas: [] },
];

// Recuperador simulado: devolve chunks (dois do doc 1, para provar a deduplicação por documento).
function recuperadorPorPergunta(mapa) {
  return jest.fn(async (pergunta) => mapa[pergunta]);
}

describe('rodarEvalRecuperacao', () => {
  it('mede recall e MRR por documento (chunks do mesmo documento contam uma vez)', async () => {
    const recuperar = recuperadorPorPergunta({
      p1: [{ docId: 1, score: 0.9 }, { docId: 1, score: 0.8 }, { docId: 5, score: 0.5 }],
      p2: [{ docId: 9, score: 0.7 }, { docId: 3, score: 0.6 }, { docId: 2, score: 0.5 }],
      p3: [{ docId: 7, score: 0.1 }],
    });

    const r = await rodarEvalRecuperacao({ dataset, recuperar, k: 3 });

    expect(r.perguntas.find((p) => p.id === 'q1')).toMatchObject({ recall: 1, rr: 1, docIds: [1, 5] });
    expect(r.perguntas.find((p) => p.id === 'q2')).toMatchObject({ recall: 1, rr: 0.5 });
    expect(r.resumo).toMatchObject({ n_recuperacao: 2, recall_medio: 1, mrr: 0.75 });
  });

  it('repassa k e filtros ao recuperador', async () => {
    const recuperar = recuperadorPorPergunta({ p1: [], p2: [], p3: [] });

    await rodarEvalRecuperacao({ dataset, recuperar, k: 7 });

    expect(recuperar).toHaveBeenCalledWith('p2', { k: 7, filtros: { ano: 2025 } });
    expect(recuperar).toHaveBeenCalledWith('p1', { k: 7, filtros: undefined });
  });

  it('pergunta que deve ser recusada passa quando o melhor score fica abaixo do limiar de evidência', async () => {
    const baixo = recuperadorPorPergunta({ p1: [], p2: [], p3: [{ docId: 7, score: 0.1 }] });
    const alto = recuperadorPorPergunta({ p1: [], p2: [], p3: [{ docId: 7, score: 0.6 }] });

    const ok = await rodarEvalRecuperacao({ dataset, recuperar: baixo, limiarEvidencia: 0.2 });
    const falha = await rodarEvalRecuperacao({ dataset, recuperar: alto, limiarEvidencia: 0.2 });

    expect(ok.resumo.recusa_correta_pct).toBe(1);
    expect(falha.resumo.recusa_correta_pct).toBe(0);
  });

  it('recuperação vazia dá recall 0 e não quebra', async () => {
    const r = await rodarEvalRecuperacao({
      dataset: [dataset[0]],
      recuperar: recuperadorPorPergunta({ p1: [] }),
    });

    expect(r.perguntas[0]).toMatchObject({ recall: 0, rr: 0, docIds: [] });
  });
});

describe('verificarLimiares', () => {
  const resumo = { recall_medio: 0.8, mrr: 0.6, recusa_correta_pct: 1 };

  it('passa quando todas as métricas atingem o mínimo', () => {
    expect(verificarLimiares(resumo, { recall_medio: 0.8, mrr: 0.5, recusa_correta_pct: 1 })).toEqual({ passou: true, falhas: [] });
  });

  it('lista cada métrica abaixo do limiar', () => {
    const r = verificarLimiares(resumo, { recall_medio: 0.9, mrr: 0.7, recusa_correta_pct: 1 });

    expect(r.passou).toBe(false);
    expect(r.falhas).toHaveLength(2);
    expect(r.falhas[0]).toMatch(/recall_medio/);
  });

  it('métrica ausente (null) conta como falha: gate não passa por falta de dado', () => {
    const r = verificarLimiares({ recall_medio: null, mrr: 1, recusa_correta_pct: 1 }, { recall_medio: 0.5 });

    expect(r.passou).toBe(false);
  });
});

describe('formatarRelatorio', () => {
  it('gera tabela legível com o resumo e as perguntas que erraram', () => {
    const texto = formatarRelatorio({
      resumo: { n_recuperacao: 1, recall_medio: 0.5, mrr: 0.25, n_recusa: 0, recusa_correta_pct: null },
      perguntas: [{ id: 'q9', tipo: 'recuperacao', recall: 0, rr: 0, docIds: [4] }],
    });

    expect(texto).toContain('recall_medio');
    expect(texto).toContain('q9');
  });
});
