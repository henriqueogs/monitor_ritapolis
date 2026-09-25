'use strict';

const { createServer } = require('./server');

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      resolve({ base: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((d) => server.close(d)) });
    });
  });
}

describe('GET /api/saude/pipeline', () => {
  it('é público e devolve status, ia e documentos_recentes', async () => {
    const srv = await listen(createServer());
    try {
      const res = await fetch(`${srv.base}/api/saude/pipeline`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(['ok', 'alerta']).toContain(body.status);
      expect(body).toHaveProperty('ia.scheduler');
      expect(body).toHaveProperty('documentos_recentes.janela_dias', 30);
    } finally {
      await srv.close();
    }
  });
});
