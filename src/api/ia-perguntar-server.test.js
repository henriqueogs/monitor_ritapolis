'use strict';

// Separado de ia-perguntar.test.js porque carrega o server completo (abre o banco de documentos).
const { createServer } = require('./server');

const respostaOk = {
  recusou: false,
  resposta: 'A vencedora foi X.',
  citacoes: [],
  fontes: [],
  prompt_versao: 'rag-resposta-v1',
};

describe('wiring no createServer', () => {
  async function ouvir(app) {
    const server = await new Promise(resolve => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    return {
      base: `http://127.0.0.1:${server.address().port}`,
      close: () => new Promise(d => server.close(d)),
    };
  }

  it('POST é público (sem sessão admin) e chega ao serviço injetado', async () => {
    const perguntar = jest.fn().mockResolvedValue(respostaOk);
    const srv = await ouvir(createServer({ servicoPerguntar: { perguntar } }));
    try {
      const res = await fetch(`${srv.base}/api/ia/perguntar`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pergunta: 'Quem venceu?' }),
      });

      expect(res.status).toBe(200);
      expect(perguntar).toHaveBeenCalled();
    } finally {
      await srv.close();
    }
  });

  it('sem serviço (desligado/índice ausente): 503, nunca 401/500', async () => {
    const srv = await ouvir(createServer({ servicoPerguntar: null }));
    try {
      const res = await fetch(`${srv.base}/api/ia/perguntar`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pergunta: 'Quem venceu?' }),
      });

      expect(res.status).toBe(503);
    } finally {
      await srv.close();
    }
  });
});
