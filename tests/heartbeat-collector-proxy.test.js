'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Request, Response, Headers } = global;
const { parsePreviewTarget } = require('../infrastructure/production-heartbeat/src/preview-target');

function loadWorker(fetch) {
  const source = fs.readFileSync(
    path.join(__dirname, '../infrastructure/production-heartbeat/src/index.js'), 'utf8'
  ).replace(/^import .*;\r?\n/, '').replace('export default {', 'module.exports = {');
  const context = { module: { exports: {} }, URL, Request, Response, Headers, fetch, parsePreviewTarget };
  vm.runInNewContext(source, context);
  return context.module.exports;
}

const token = 'x'.repeat(32);
const target = 'https://ritapolis.mg.leg.br/ws_consulta/sgc/buscarLegislacoes.php?DataHora=123';
function request(url = target) {
  return new Request('https://proxy.example/proxy', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'x-target-url': url,
      'content-type': 'application/x-www-form-urlencoded' },
    body: 'INT_PAG=2&INT_EXRC_LEGS=2026',
  });
}

describe('Worker collector proxy', () => {
  it('follows the Camara canonical redirect preserving the SGC POST and query', async () => {
    const canonical = target.replace('://ritapolis.', '://www.ritapolis.');
    const fetch = jest.fn()
      .mockResolvedValueOnce(new Response(null, { status: 301, headers: { location: canonical } }))
      .mockResolvedValueOnce(new Response('001 - {"HTML":"resultado"}'));
    const response = await loadWorker(fetch).fetch(request(), { COLLECTOR_PROXY_TOKEN: token }, {});
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('resultado');
    expect(fetch.mock.calls.map(([url]) => url.toString())).toEqual([target, canonical]);
    for (const [, options] of fetch.mock.calls) {
      expect(options.method).toBe('POST');
      expect(new TextDecoder().decode(options.body)).toBe('INT_PAG=2&INT_EXRC_LEGS=2026');
      expect(options.headers.get('authorization')).toBeNull();
    }
  });

  it('rejects a redirect to an unapproved host', async () => {
    const fetch = jest.fn().mockResolvedValue(new Response(null, {
      status: 301, headers: { location: 'https://www.ritapolis.mg.leg.br.evil.example/' },
    }));
    const response = await loadWorker(fetch).fetch(request(), { COLLECTOR_PROXY_TOKEN: token }, {});
    expect(response.status).toBe(502);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects unapproved targets and unauthenticated calls before fetching', async () => {
    const fetch = jest.fn();
    const worker = loadWorker(fetch);
    expect((await worker.fetch(request('https://evil.example/'),
      { COLLECTOR_PROXY_TOKEN: token }, {})).status).toBe(400);
    expect((await worker.fetch(request(), { COLLECTOR_PROXY_TOKEN: 'different' }, {})).status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });
});
