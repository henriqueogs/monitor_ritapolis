'use strict';

const fs = require('fs');
const path = require('path');
const {
  PREFIXO_BOTID,
  SOURCE_SEM_BOTID,
  ROTAS_PROTEGIDAS,
  verificarHumano,
} = require('../frontend/lib/botid');

const PROXY_SRC = fs.readFileSync(path.resolve(__dirname, '../frontend/proxy.js'), 'utf8');
// Lido como texto: o CI do backend não instala as dependências do frontend (next, botid).
const NEXT_CONFIG_SRC = fs.readFileSync(path.resolve(__dirname, '../frontend/next.config.js'), 'utf8');
const ROTA_PERGUNTAR_SRC = fs.readFileSync(
  path.resolve(__dirname, '../frontend/app/api/perguntar/route.js'),
  'utf8'
);
const CAMINHO_DESAFIO = `${PREFIXO_BOTID}/2d206a39-8ed7-437e-a3be-862e0f06eea3/a-4-a/c.js`;

function regexDoSource(source) {
  return new RegExp(`^${source}$`);
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

    it('next.config exporta o config passado pelo withBotId (rewrites do desafio)', () => {
      expect(NEXT_CONFIG_SRC).toMatch(/module\.exports = withBotId\(nextConfig\);/);
    });

    it('os cabeçalhos de segurança (X-Frame-Options: DENY) não cobrem o caminho do BotID', () => {
      expect(NEXT_CONFIG_SRC).toContain('{ source: SOURCE_SEM_BOTID, headers: securityHeaders }');
      expect(regexDoSource(SOURCE_SEM_BOTID).test('/acervo')).toBe(true);
      expect(regexDoSource(SOURCE_SEM_BOTID).test(CAMINHO_DESAFIO)).toBe(false);
    });

    it('o proxy (CSP com frame-ancestors none) não roda no caminho do BotID', () => {
      const m = PROXY_SRC.match(/source:\s*'([^']+)'/);
      const re = regexDoSource(m[1]);

      expect(re.test(CAMINHO_DESAFIO)).toBe(false);
      expect(re.test('/acervo')).toBe(true);
    });
  });
});
