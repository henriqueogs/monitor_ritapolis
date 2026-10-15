'use strict';

const express = require('express');
const { criarHandlerPerguntar } = require('./ia-perguntar');
const { PerguntaInvalidaError, OrcamentoEsgotadoError } = require('../ai/rag/perguntar');
const { ModeloIndisponivelError, ProviderLimiteError } = require('../ai/ports/errors');
const security = require('./security');

async function subir(servico) {
  const app = express();
  app.use(express.json());
  app.post('/api/ia/perguntar', criarHandlerPerguntar({ obterServico: () => servico }));
  const server = await new Promise(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (corpo, cabecalhos = {}) =>
    fetch(`${base}/api/ia/perguntar`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...cabecalhos },
      body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo),
    });
  return { post, close: () => new Promise(d => server.close(d)) };
}

const respostaOk = {
  recusou: false,
  resposta: 'A vencedora foi X.',
  citacoes: [
    {
      doc_id: 1,
      trecho: 'trecho copiado do doc',
      url_origem: 'https://f/1',
      origemGenerica: false,
    },
  ],
  fontes: [{ docId: 1, url_origem: 'https://f/1', origemGenerica: false }],
  prompt_versao: 'rag-resposta-v1',
};

describe('POST /api/ia/perguntar', () => {
  it('200 com a resposta do serviço e Cache-Control: no-store', async () => {
    const perguntar = jest.fn().mockResolvedValue(respostaOk);
    const srv = await subir({ perguntar });
    try {
      const res = await srv.post({ pergunta: 'Quem venceu?', filtros: { ano: [2025] } });

      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toBe('no-store');
      expect(await res.json()).toEqual(respostaOk);
      expect(perguntar).toHaveBeenCalledWith({
        pergunta: 'Quem venceu?',
        filtros: { ano: [2025] },
      });
    } finally {
      await srv.close();
    }
  });

  it('serviço indisponível (kill-switch ou índice ausente): 503 sem chamar nada', async () => {
    const srv = await subir(null);
    try {
      const res = await srv.post({ pergunta: 'Quem venceu?' });

      expect(res.status).toBe(503);
      expect((await res.json()).error).toBe('ia_indisponivel');
    } finally {
      await srv.close();
    }
  });

  it.each([
    [new PerguntaInvalidaError('curta'), 400, 'pergunta_invalida'],
    [new OrcamentoEsgotadoError(300), 429, 'limite_diario'],
    [new ProviderLimiteError({ modelo: 'm', retryAfterMs: 7000 }), 429, 'ia_sobrecarregada'],
    [new ModeloIndisponivelError({ modelo: 'm', status: 410 }), 503, 'ia_indisponivel'],
    [new Error('chave sk-secreta vazou aqui'), 502, 'ia_falhou'],
  ])('mapeia %p para HTTP %i / %s sem vazar a mensagem interna', async (erro, status, codigo) => {
    const srv = await subir({ perguntar: jest.fn().mockRejectedValue(erro) });
    try {
      const res = await srv.post({ pergunta: 'Quem venceu?' });
      const corpo = await res.json();

      expect(res.status).toBe(status);
      expect(corpo.error).toBe(codigo);
      expect(JSON.stringify(corpo)).not.toMatch(/sk-secreta/);
    } finally {
      await srv.close();
    }
  });

  it('429 do provedor informa Retry-After em segundos', async () => {
    const erro = new ProviderLimiteError({ modelo: 'm', retryAfterMs: 7000 });
    const srv = await subir({ perguntar: jest.fn().mockRejectedValue(erro) });
    try {
      const res = await srv.post({ pergunta: 'Quem venceu?' });

      expect(res.headers.get('retry-after')).toBe('7');
    } finally {
      await srv.close();
    }
  });

  it('corpo sem objeto (array, texto) é 400 e não chega ao serviço', async () => {
    const perguntar = jest.fn();
    const srv = await subir({ perguntar });
    try {
      const res = await srv.post('[1,2]');

      expect(res.status).toBe(400);
      expect(perguntar).not.toHaveBeenCalled();
    } finally {
      await srv.close();
    }
  });
});

describe('segurança da rota de perguntas', () => {
  const req = (path, method) => ({ path, method, query: {} });

  it('POST /api/ia/perguntar é público (não exige admin) e tem cota própria', () => {
    expect(security.classifyRequest(req('/api/ia/perguntar', 'POST'))).toBe('publicAsk');
    expect(security.requireAdmin).toBeDefined();
    expect(security.resolverJanelaRateLimit('publicAsk', {})).toEqual({
      windowMs: 900000,
      limit: 30,
    });
  });

  it('as demais rotas /api/ia/ continuam administrativas', () => {
    expect(security.classifyRequest(req('/api/ia/resumos/jobs/lote', 'POST'))).toBe('expensiveJob');
    expect(security.classifyRequest(req('/api/ia/perguntar-outra-coisa', 'POST'))).toBe(
      'expensiveJob'
    );
    expect(security.classifyRequest(req('/api/ia/perguntar', 'GET'))).toBe('adminRead');
  });
});
