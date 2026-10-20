'use strict';

const {
  PERGUNTA_MIN,
  PERGUNTA_MAX,
  validarPergunta,
  interpretarResposta,
  enviarPergunta,
  urlSegura,
} = require('../frontend/lib/perguntar');

const respostaOk = {
  recusou: false,
  resposta: 'A vencedora foi a empresa X.',
  citacoes: [
    {
      doc_id: 'documento:1',
      trecho: 'X foi declarada vencedora',
      url_origem: 'https://prefeitura.example/edital.pdf',
      origemGenerica: false,
    },
    {
      doc_id: 'documento:1',
      trecho: 'valor homologado',
      url_origem: 'https://prefeitura.example/edital.pdf',
      origemGenerica: false,
    },
    {
      doc_id: 'documento:2',
      trecho: 'publicado na listagem',
      url_origem: 'https://prefeitura.example/licitacoes',
      origemGenerica: true,
    },
  ],
  fontes: [],
};

describe('validarPergunta', () => {
  it('normaliza espaços e aceita o intervalo permitido', () => {
    expect(validarPergunta('  Quem   venceu \n o pregão?  ')).toEqual({
      ok: true,
      pergunta: 'Quem venceu o pregão?',
    });
  });

  it.each([undefined, null, 42, '', '  ', 'oi'])('rejeita %p como curta/ausente', valor => {
    const r = validarPergunta(valor);
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(new RegExp(`${PERGUNTA_MIN}`));
  });

  it('rejeita acima do máximo', () => {
    const r = validarPergunta('x'.repeat(PERGUNTA_MAX + 1));
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(new RegExp(`${PERGUNTA_MAX}`));
  });
});

describe('urlSegura', () => {
  it('só aceita http(s)', () => {
    expect(urlSegura('https://a.example/x')).toBe('https://a.example/x');
    expect(urlSegura('http://a.example/x')).toBe('http://a.example/x');
    expect(urlSegura('javascript:alert(1)')).toBeNull();
    expect(urlSegura('data:text/html,<b>x</b>')).toBeNull();
    expect(urlSegura('')).toBeNull();
    expect(urlSegura(undefined)).toBeNull();
  });
});

describe('interpretarResposta: 200', () => {
  it('resposta com fontes agrupadas por URL, com os trechos de cada uma', () => {
    const v = interpretarResposta(200, respostaOk);

    expect(v.tipo).toBe('resposta');
    expect(v.texto).toBe('A vencedora foi a empresa X.');
    expect(v.fontes).toHaveLength(2);
    expect(v.fontes[0]).toMatchObject({
      url: 'https://prefeitura.example/edital.pdf',
      generica: false,
      trechos: ['X foi declarada vencedora', 'valor homologado'],
    });
  });

  it('fonte genérica é rotulada honestamente como listagem oficial (§11.3)', () => {
    const v = interpretarResposta(200, respostaOk);
    const generica = v.fontes.find(f => f.generica);

    expect(generica.rotulo).toMatch(/listagem/i);
    expect(generica.nota).toMatch(/sem arquivo próprio/i);
    expect(v.fontes[0].nota).toBeNull();
  });

  it('recusa vira tipo "recusa", sem fontes', () => {
    const v = interpretarResposta(200, {
      recusou: true,
      resposta: 'Não encontrei evidência suficiente.',
      citacoes: [],
      fontes: [],
    });

    expect(v).toMatchObject({
      tipo: 'recusa',
      texto: 'Não encontrei evidência suficiente.',
      fontes: [],
    });
  });

  it('descarta citação com URL insegura em vez de renderizar o link', () => {
    const v = interpretarResposta(200, {
      ...respostaOk,
      citacoes: [{ doc_id: 'x', trecho: 't', url_origem: 'javascript:alert(1)' }],
    });

    expect(v.fontes).toEqual([]);
  });

  it('corpo malformado não quebra: vira erro genérico', () => {
    expect(interpretarResposta(200, null).tipo).toBe('erro');
    expect(interpretarResposta(200, { recusou: false }).tipo).toBe('erro');
  });
});

describe('interpretarResposta: erros', () => {
  it.each([
    [503, 'ia_indisponivel', /não está disponível/i],
    [429, 'limite_diario', /limite/i],
    [429, 'ia_sobrecarregada', /muitas solicitações/i],
    [400, 'pergunta_invalida', /entre 3 e 500/i],
    [502, 'ia_falhou', /não foi possível/i],
  ])('%i/%s tem mensagem em português', (status, codigo, padrao) => {
    const v = interpretarResposta(status, { error: codigo });

    expect(v.tipo).toBe('erro');
    expect(v.codigo).toBe(codigo);
    expect(v.mensagem).toMatch(padrao);
  });

  it('429 do limitador de requisições (sem código) também é amigável', () => {
    const v = interpretarResposta(429, {
      error: 'Muitas requisicoes; tente novamente em instantes',
    });

    expect(v.mensagem).toMatch(/muitas solicitações/i);
  });

  it('nunca repete texto técnico vindo do servidor', () => {
    const v = interpretarResposta(502, { error: 'ia_falhou', detalhe: 'stack trace secreta' });

    expect(JSON.stringify(v)).not.toMatch(/stack trace/);
  });
});

describe('enviarPergunta', () => {
  const fetchCom = (status, corpo) =>
    jest.fn().mockResolvedValue({ status, json: async () => corpo });

  it('faz POST JSON em /api/perguntar com a pergunta normalizada', async () => {
    const fetchImpl = fetchCom(200, respostaOk);

    const v = await enviarPergunta({ pergunta: '  Quem venceu?  ', fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/perguntar',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pergunta: 'Quem venceu?' }),
      })
    );
    expect(v.tipo).toBe('resposta');
  });

  it('pergunta inválida nem chama a rede', async () => {
    const fetchImpl = fetchCom(200, respostaOk);

    const v = await enviarPergunta({ pergunta: 'oi', fetchImpl });

    expect(v).toMatchObject({ tipo: 'erro', codigo: 'pergunta_invalida' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('falha de rede vira erro amigável, sem lançar', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new TypeError('fetch failed'));

    const v = await enviarPergunta({ pergunta: 'Quem venceu?', fetchImpl });

    expect(v).toMatchObject({ tipo: 'erro', codigo: 'rede' });
    expect(v.mensagem).toMatch(/conexão/i);
  });

  it('resposta que não é JSON vira erro amigável', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      status: 502,
      json: async () => {
        throw new SyntaxError('Unexpected token <');
      },
    });

    const v = await enviarPergunta({ pergunta: 'Quem venceu?', fetchImpl });

    expect(v.tipo).toBe('erro');
  });
});
