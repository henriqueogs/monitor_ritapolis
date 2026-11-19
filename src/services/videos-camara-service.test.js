'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

function criarBancoMemoria() {
  const conn = new DatabaseSync(':memory:');
  conn.exec(fs.readFileSync(path.resolve(__dirname, '../db/schema.sql'), 'utf8'));
  return conn;
}

const mockConn = criarBancoMemoria();
jest.mock('../db/connection', () => ({ db: mockConn }));

const { upsertVideo, getVideoComTrechos } = require('../db/camara-videos-repo');
const {
  registrarVideosDoFeed,
  transcreverVideo,
  importarTranscricoes,
} = require('./videos-camara-service');

const FEED = `<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015">
 <entry><yt:videoId>v1</yt:videoId><title>16ª Sessão Ordinária da 2ª Sessão Legislativa</title>
  <published>2026-11-05T13:25:40+00:00</published></entry>
 <entry><yt:videoId>v2</yt:videoId><title>Pregão 001/26</title>
  <published>2026-08-26T20:46:00+00:00</published></entry>
</feed>`;

const LEGENDA = {
  eventos: [{ tStartMs: 2000, segs: [{ utf8: 'declaro aberta a sessão' }] }],
  idioma: 'pt',
  automatica: true,
};

describe('videos-camara-service', () => {
  beforeEach(() => {
    mockConn.exec('DELETE FROM camara_videos;');
  });

  describe('registrarVideosDoFeed', () => {
    it('grava os vídeos do feed já classificados e conta o que é novo', () => {
      expect(registrarVideosDoFeed(FEED)).toEqual({ registros: 2, novos: 2, atualizados: 0 });
      expect(getVideoComTrechos('v1')).toMatchObject({ tipo: 'sessao_ordinaria', numero: 16 });
      expect(registrarVideosDoFeed(FEED)).toEqual({ registros: 2, novos: 0, atualizados: 0 });
    });
  });

  describe('transcreverVideo', () => {
    it('devolve os trechos e a origem da legenda', async () => {
      const buscarLegenda = jest.fn().mockResolvedValue(LEGENDA);

      expect(await transcreverVideo('v1', { buscarLegenda })).toEqual({
        videoId: 'v1',
        origem: 'legenda_automatica_youtube',
        trechos: [{ inicioSeg: 2, texto: 'declaro aberta a sessão' }],
      });
    });

    it('marca legenda feita por pessoa com outra origem', async () => {
      const buscarLegenda = jest.fn().mockResolvedValue({ ...LEGENDA, automatica: false });

      expect((await transcreverVideo('v1', { buscarLegenda })).origem).toBe('legenda_youtube');
    });

    it('devolve trechos vazios quando não há legenda', async () => {
      const buscarLegenda = jest.fn().mockResolvedValue(null);

      expect(await transcreverVideo('v1', { buscarLegenda })).toEqual({
        videoId: 'v1',
        origem: null,
        trechos: [],
      });
    });
  });

  describe('importarTranscricoes', () => {
    const item = (videoId, trechos = [{ inicioSeg: 0, texto: 'bom dia' }]) => ({
      videoId,
      origem: trechos.length ? 'legenda_automatica_youtube' : null,
      trechos,
    });

    beforeEach(() => {
      upsertVideo({ videoId: 'v1', titulo: 'Sessão', publicadoEm: '2026-11-05T13:25:40+00:00' });
      upsertVideo({ videoId: 'v2', titulo: 'Outra', publicadoEm: '2026-11-06T13:25:40+00:00' });
    });

    it('grava as transcrições, marca quem não tem legenda e ignora vídeo desconhecido', () => {
      const resumo = importarTranscricoes([item('v1'), item('v2', []), item('fora-do-banco')]);

      expect(resumo).toEqual({ importados: 1, semLegenda: 1, jaTranscritos: 0, desconhecidos: 1 });
      expect(getVideoComTrechos('v1').status_transcricao).toBe('ok');
      expect(getVideoComTrechos('v2').status_transcricao).toBe('sem_legenda');
    });

    it('não regrava vídeo já transcrito', () => {
      importarTranscricoes([item('v1')]);

      const resumo = importarTranscricoes([item('v1', [{ inicioSeg: 0, texto: 'outra coisa' }])]);

      expect(resumo.jaTranscritos).toBe(1);
      expect(getVideoComTrechos('v1').trechos[0].texto).toBe('bom dia');
    });

    it('vídeo sem legenda volta a ser tentado quando a legenda aparece', () => {
      importarTranscricoes([item('v1', [])]);

      expect(importarTranscricoes([item('v1')]).importados).toBe(1);
    });
  });
});
