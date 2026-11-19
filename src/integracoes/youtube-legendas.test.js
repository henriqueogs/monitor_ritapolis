'use strict';

const { buscarLegenda } = require('./youtube-legendas');

function resposta(corpo) {
  return { ok: true, status: 200, json: async () => corpo };
}

function playerCom(tracks, status = 'OK') {
  return resposta({
    playabilityStatus: { status },
    captions: tracks ? { playerCaptionsTracklistRenderer: { captionTracks: tracks } } : undefined,
  });
}

describe('youtube-legendas', () => {
  it('baixa os eventos da legenda em português e diz se é automática', async () => {
    const eventos = [{ tStartMs: 0, segs: [{ utf8: 'bom dia' }] }];
    const fetchFn = jest
      .fn()
      .mockResolvedValueOnce(
        playerCom([
          { languageCode: 'en', baseUrl: 'https://legenda.exemplo/en' },
          { languageCode: 'pt', kind: 'asr', baseUrl: 'https://legenda.exemplo/pt' },
        ])
      )
      .mockResolvedValueOnce(resposta({ events: eventos }));

    const legenda = await buscarLegenda('abc', { fetchFn });

    expect(legenda).toEqual({ eventos, idioma: 'pt', automatica: true });
    expect(fetchFn.mock.calls[1][0]).toBe('https://legenda.exemplo/pt&fmt=json3');
  });

  it('retorna null quando o vídeo não tem legenda', async () => {
    const fetchFn = jest.fn().mockResolvedValueOnce(playerCom(null));

    expect(await buscarLegenda('abc', { fetchFn })).toBeNull();
  });

  it('retorna null quando só há legenda em outro idioma', async () => {
    const fetchFn = jest
      .fn()
      .mockResolvedValueOnce(playerCom([{ languageCode: 'en', baseUrl: 'https://x.exemplo/en' }]));

    expect(await buscarLegenda('abc', { fetchFn })).toBeNull();
  });

  it('explica o bloqueio quando o YouTube exige login (IP de datacenter)', async () => {
    const fetchFn = jest.fn().mockResolvedValueOnce(playerCom(null, 'LOGIN_REQUIRED'));

    await expect(buscarLegenda('abc', { fetchFn })).rejects.toThrow(/LOGIN_REQUIRED/);
  });

  it('propaga falha de rede com o id do vídeo', async () => {
    const fetchFn = jest.fn().mockResolvedValueOnce({ ok: false, status: 429 });

    await expect(buscarLegenda('abc', { fetchFn })).rejects.toThrow(/abc.*429/);
  });
});
