'use strict';

const {
  criarServicoPerguntar,
  PerguntaInvalidaError,
  OrcamentoEsgotadoError,
  MENSAGEM_NAO_FUNDAMENTADA,
} = require('./perguntar');
const { MENSAGEM_SEM_EVIDENCIA } = require('./resposta');
const { ProviderLimiteError } = require('../ports/errors');

const TEXTO_1 =
  'A empresa Alimentos Minas Ltda foi declarada vencedora do pregão eletrônico 001/2025.';
const recuperados = [
  {
    id: '1#0',
    docId: 1,
    texto: TEXTO_1,
    url_origem: 'https://fonte.example/1',
    origemGenerica: false,
    score: 0.8,
    ramos: ['vetor', 'lexical'],
  },
  {
    id: '2#0',
    docId: 2,
    texto: 'Texto fraco sem relação com a pergunta.',
    url_origem: 'https://fonte.example/2',
    origemGenerica: true,
    score: 0.05,
    ramos: ['vetor'],
  },
];

const llmQueResponde = resposta => ({
  provider: 'teste',
  model: 'llm-teste',
  generateJson: jest.fn().mockResolvedValue(resposta),
});

const respostaFiel = {
  recusou: false,
  resposta: 'A vencedora foi a empresa Alimentos Minas Ltda.',
  citacoes: [
    {
      doc_id: 1,
      trecho: 'Alimentos Minas Ltda foi declarada vencedora',
      url_origem: 'https://fonte.example/1',
    },
  ],
};

function montar({ llm = llmQueResponde(respostaFiel), recuperar, ...resto } = {}) {
  const traces = [];
  const servico = criarServicoPerguntar({
    recuperar: recuperar ?? jest.fn().mockResolvedValue(recuperados),
    llm,
    registrarTrace: t => traces.push(t),
    ...resto,
  });
  return { servico, llm, traces };
}

describe('perguntar()', () => {
  it('responde com citação verificada, fontes com origem e trace', async () => {
    const { servico, traces } = montar();

    const r = await servico.perguntar({ pergunta: 'Quem venceu o pregão 001/2025?' });

    expect(r.recusou).toBe(false);
    expect(r.resposta).toMatch(/Alimentos Minas/);
    expect(r.citacoes).toEqual([
      {
        doc_id: 1,
        trecho: 'Alimentos Minas Ltda foi declarada vencedora',
        url_origem: 'https://fonte.example/1',
        origemGenerica: false,
      },
    ]);
    expect(r.fontes).toEqual([
      { docId: 1, url_origem: 'https://fonte.example/1', origemGenerica: false },
    ]);
    expect(traces).toHaveLength(1);
    expect(traces[0]).toMatchObject({
      modelo: 'llm-teste',
      recuperados: 2,
      usados: 1,
      recusou: false,
      fundamentada: true,
    });
    expect(traces[0].latencia_ms).toBeGreaterThanOrEqual(0);
    expect(traces[0].tokens_estimados).toBeGreaterThan(0);
  });

  it('só entram no contexto os recuperados acima do limiar de evidência', async () => {
    const { servico, llm } = montar();

    await servico.perguntar({ pergunta: 'Quem venceu o pregão 001/2025?' });

    const prompt = llm.generateJson.mock.calls[0][0].prompt;
    expect(prompt).toContain('Alimentos Minas');
    expect(prompt).not.toContain('Texto fraco');
  });

  it('sem evidência acima do limiar: recusa direta e o LLM nem é chamado', async () => {
    const { servico, llm } = montar({
      recuperar: jest.fn().mockResolvedValue([{ ...recuperados[1] }]),
    });

    const r = await servico.perguntar({ pergunta: 'Qual o salário do prefeito de Marte?' });

    expect(r).toMatchObject({ recusou: true, resposta: MENSAGEM_SEM_EVIDENCIA, citacoes: [] });
    expect(llm.generateJson).not.toHaveBeenCalled();
  });

  it('resposta sem citação válida vira recusa explícita (nunca entrega texto não fundamentado)', async () => {
    const llm = llmQueResponde({ recusou: false, resposta: 'A empresa X venceu.', citacoes: [] });
    const { servico, traces } = montar({ llm });

    const r = await servico.perguntar({ pergunta: 'Quem venceu o pregão 001/2025?' });

    expect(r).toMatchObject({ recusou: true, resposta: MENSAGEM_NAO_FUNDAMENTADA, citacoes: [] });
    expect(r.resposta).not.toMatch(/empresa X/);
    expect(traces[0]).toMatchObject({ fundamentada: false });
  });

  it('citação com url_origem inventada derruba a resposta', async () => {
    const llm = llmQueResponde({
      ...respostaFiel,
      citacoes: [{ ...respostaFiel.citacoes[0], url_origem: 'https://inventada.example' }],
    });
    const { servico } = montar({ llm });

    const r = await servico.perguntar({ pergunta: 'Quem venceu o pregão 001/2025?' });

    expect(r.recusou).toBe(true);
    expect(r.resposta).toBe(MENSAGEM_NAO_FUNDAMENTADA);
  });

  it('valor em reais que não está nos documentos derruba a resposta (V6)', async () => {
    const llm = llmQueResponde({ ...respostaFiel, resposta: 'Venceu com R$ 9.999.999,00.' });
    const { servico } = montar({ llm });

    const r = await servico.perguntar({ pergunta: 'Quem venceu o pregão 001/2025?' });

    expect(r).toMatchObject({ recusou: true, resposta: MENSAGEM_NAO_FUNDAMENTADA });
  });

  it('linguagem acusatória derruba a resposta (fiscal-privacidade)', async () => {
    const llm = llmQueResponde({ ...respostaFiel, resposta: 'Há indício de fraude no pregão.' });
    const { servico } = montar({ llm });

    const r = await servico.perguntar({ pergunta: 'Quem venceu o pregão 001/2025?' });

    expect(r).toMatchObject({ recusou: true, resposta: MENSAGEM_NAO_FUNDAMENTADA });
  });

  it('saída do modelo fora do contrato vira recusa, não erro 500', async () => {
    const llm = llmQueResponde({ oops: true });
    const { servico } = montar({ llm });

    const r = await servico.perguntar({ pergunta: 'Quem venceu o pregão 001/2025?' });

    expect(r).toMatchObject({ recusou: true, resposta: MENSAGEM_NAO_FUNDAMENTADA });
  });

  it('falha do provedor propaga com o tipo preservado (a rota decide o status)', async () => {
    const llm = {
      provider: 'teste',
      model: 'm',
      generateJson: jest.fn().mockRejectedValue(new ProviderLimiteError({ modelo: 'm' })),
    };
    const { servico } = montar({ llm });

    await expect(
      servico.perguntar({ pergunta: 'Quem venceu o pregão 001/2025?' })
    ).rejects.toBeInstanceOf(ProviderLimiteError);
  });

  it.each([undefined, null, 42, '', '   ', 'oi', 'x'.repeat(501)])(
    'pergunta inválida (%p) é rejeitada antes de gastar recuperação ou LLM',
    async pergunta => {
      const recuperar = jest.fn();
      const { servico, llm } = montar({ recuperar });

      await expect(servico.perguntar({ pergunta })).rejects.toBeInstanceOf(PerguntaInvalidaError);
      expect(recuperar).not.toHaveBeenCalled();
      expect(llm.generateJson).not.toHaveBeenCalled();
    }
  );

  it('filtros: só ano, tipo e fonte; chave desconhecida é rejeitada', async () => {
    const recuperar = jest.fn().mockResolvedValue(recuperados);
    const { servico } = montar({ recuperar });

    await servico.perguntar({
      pergunta: 'Quem venceu o pregão 001/2025?',
      filtros: { ano: [2025], tipo: 'edital' },
    });
    expect(recuperar.mock.calls[0][1].filtros).toEqual({ ano: [2025], tipo: 'edital' });

    await expect(
      servico.perguntar({
        pergunta: 'Quem venceu o pregão 001/2025?',
        filtros: { metadados_secretos: 'x' },
      })
    ).rejects.toBeInstanceOf(PerguntaInvalidaError);
    await expect(
      servico.perguntar({ pergunta: 'Quem venceu o pregão 001/2025?', filtros: { ano: 'abc' } })
    ).rejects.toBeInstanceOf(PerguntaInvalidaError);
  });

  it('contexto respeita o teto de caracteres (teto de tokens por pergunta)', async () => {
    const longos = Array.from({ length: 5 }, (_, i) => ({
      ...recuperados[0],
      id: `${i}#0`,
      docId: i + 1,
      texto: 'x'.repeat(1000),
      url_origem: `https://fonte.example/${i + 1}`,
    }));
    const { servico, traces } = montar({
      recuperar: jest.fn().mockResolvedValue(longos),
      tetoCaracteresContexto: 2500,
      llm: llmQueResponde({ recusou: true, resposta: 'sem base', citacoes: [] }),
    });

    await servico.perguntar({ pergunta: 'Pergunta de teste longa?' });

    expect(traces[0].usados).toBe(2);
  });

  it('orçamento diário: depois do teto, lança OrcamentoEsgotadoError sem chamar nada', async () => {
    const recuperar = jest.fn().mockResolvedValue(recuperados);
    const { servico } = montar({
      recuperar,
      limiteDiario: 2,
      agora: () => new Date('2026-10-15T12:00:00Z'),
    });

    await servico.perguntar({ pergunta: 'Quem venceu o pregão 001/2025?' });
    await servico.perguntar({ pergunta: 'Quem venceu o pregão 001/2025?' });

    await expect(
      servico.perguntar({ pergunta: 'Quem venceu o pregão 001/2025?' })
    ).rejects.toBeInstanceOf(OrcamentoEsgotadoError);
    expect(recuperar).toHaveBeenCalledTimes(2);
  });

  it('orçamento diário zera no dia seguinte', async () => {
    let agora = new Date('2026-10-15T23:59:00Z');
    const { servico } = montar({ limiteDiario: 1, agora: () => agora });

    await servico.perguntar({ pergunta: 'Quem venceu o pregão 001/2025?' });
    agora = new Date('2026-10-16T00:01:00Z');

    await expect(
      servico.perguntar({ pergunta: 'Quem venceu o pregão 001/2025?' })
    ).resolves.toBeDefined();
  });

  it('o trace nunca guarda o texto dos documentos nem a pergunta completa em claro além do tamanho', async () => {
    const { servico, traces } = montar();

    await servico.perguntar({ pergunta: 'Quem venceu o pregão 001/2025?' });

    const serializado = JSON.stringify(traces[0]);
    expect(serializado).not.toContain('Alimentos Minas');
    expect(traces[0]).toHaveProperty('pergunta_tamanho');
  });
});
