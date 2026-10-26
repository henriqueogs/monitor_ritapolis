'use strict';

const fs = require('fs');
const path = require('path');
const { PREFIXO_BOTID, ROTAS_PROTEGIDAS, verificarHumano } = require('../frontend/lib/botid');

const PROXY_SRC = fs.readFileSync(path.resolve(__dirname, '../frontend/proxy.js'), 'utf8');
const ROTA_PERGUNTAR_SRC = fs.readFileSync(
  path.resolve(__dirname, '../frontend/app/api/perguntar/route.js'),
  'utf8'
);
const CAMINHO_DESAFIO = `${PREFIXO_BOTID}/2d206a39-8ed7-437e-a3be-862e0f06eea3/a-4-a/c.js`;

function regexDoSource(source) {
  return new RegExp(`^${source}$`);
}

async function carregarNextConfig() {
  const fabrica = require('../frontend/next.config.js');
  return fabrica('phase-production-build', {});
}

describe('frontend BotID', () => {
  describe('verificarHumano', () => {
    it('bloqueia quando o BotID classifica a requisição como robô', async () => {
      const resultado = await verificarHumano(async () => ({ isBot: true }));

      expect(resultado.bloquear).toBe(true);
    });

    it('libera quando o BotID classifica como humano', async () => {
      const resultado = await verificarHumano(async () => ({ isBot: false }));

      expect(resultado.bloquear).toBe(false);
    });

    it('libera (falha aberta) quando a verificação falha, e avisa a falha', async () => {
      const resultado = await verificarHumano(async () => {
        throw new Error('bot-protection indisponível');
      });

      expect(resultado).toEqual({ bloquear: false, falhou: true });
    });
  });

  describe('configuração', () => {
    it('protege só o POST da pergunta à IA', () => {
      expect(ROTAS_PROTEGIDAS).toEqual([{ path: '/api/perguntar', method: 'POST' }]);
    });

    it('a rota /api/perguntar consulta o BotID antes de chamar o backend', () => {
      const posCheck = ROTA_PERGUNTAR_SRC.indexOf('verificarHumano(checkBotId)');
      const posFetch = ROTA_PERGUNTAR_SRC.indexOf('fetch(`${backendApiUrl}/ia/perguntar`');

      expect(posCheck).toBeGreaterThan(-1);
      expect(posCheck).toBeLessThan(posFetch);
    });

    it('next.config aplica o withBotId (rewrites para o desafio da Vercel)', async () => {
      const config = await carregarNextConfig();
      const rewrites = await config.rewrites();
      const lista = Array.isArray(rewrites) ? rewrites : rewrites.beforeFiles;

      expect(lista.some((r) => r.destination.includes('bot-protection'))).toBe(true);
    });

    it('os cabeçalhos de segurança (X-Frame-Options: DENY) não cobrem o caminho do BotID', async () => {
      const config = await carregarNextConfig();
      const headers = await config.headers();
      const seguranca = headers.find((h) => h.headers.some((x) => x.value === 'DENY'));

      expect(regexDoSource(seguranca.source).test('/acervo')).toBe(true);
      expect(regexDoSource(seguranca.source).test(CAMINHO_DESAFIO)).toBe(false);
    });

    it('o proxy (CSP com frame-ancestors none) não roda no caminho do BotID', () => {
      const m = PROXY_SRC.match(/source:\s*'([^']+)'/);
      const re = regexDoSource(m[1]);

      expect(re.test(CAMINHO_DESAFIO)).toBe(false);
      expect(re.test('/acervo')).toBe(true);
    });
  });
});
