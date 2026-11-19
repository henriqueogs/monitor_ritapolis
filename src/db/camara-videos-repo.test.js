'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

function criarBancoMemoria() {
  const conn = new DatabaseSync(':memory:');
  conn.exec('PRAGMA foreign_keys = ON;');
  conn.exec(fs.readFileSync(path.resolve(__dirname, 'schema.sql'), 'utf8'));
  return conn;
}

const mockConn = criarBancoMemoria();
jest.mock('./connection', () => ({ db: mockConn }));

const {
  upsertVideo,
  listarVideos,
  listarVideosPendentes,
  salvarTranscricao,
  marcarSemLegenda,
  getVideoComTrechos,
} = require('./camara-videos-repo');

function video(overrides = {}) {
  return {
    videoId: 'qMwY8perAQk',
    titulo: '16ª Sessão Ordinária',
    tipo: 'sessao_ordinaria',
    numero: 16,
    publicadoEm: '2026-11-05T13:25:40+00:00',
    ...overrides,
  };
}

const TRECHOS = [
  { inicioSeg: 0, texto: 'declaro aberta a sessão' },
  { inicioSeg: 60, texto: 'em votação o projeto' },
];

describe('camara-videos-repo', () => {
  beforeEach(() => {
    mockConn.exec('DELETE FROM camara_videos;');
  });

  describe('upsertVideo', () => {
    it('insere vídeo novo como pendente de transcrição', () => {
      expect(upsertVideo(video())).toBe('inserted');
      expect(listarVideosPendentes().map((v) => v.video_id)).toEqual(['qMwY8perAQk']);
    });

    it('não mexe em vídeo igual e atualiza quando o título muda', () => {
      upsertVideo(video());

      expect(upsertVideo(video())).toBe('unchanged');
      expect(upsertVideo(video({ titulo: '16ª Sessão Ordinária (corrigido)' }))).toBe('updated');
    });

    it('ignora registro sem id', () => {
      expect(upsertVideo(video({ videoId: '' }))).toBeNull();
    });

    it('recoletar o feed não apaga a transcrição já salva', () => {
      upsertVideo(video());
      salvarTranscricao({ videoId: 'qMwY8perAQk', trechos: TRECHOS, origem: 'legenda_automatica' });

      upsertVideo(video({ titulo: 'Título novo' }));

      expect(getVideoComTrechos('qMwY8perAQk')).toMatchObject({
        status_transcricao: 'ok',
        trechos: [{ inicio_seg: 0 }, { inicio_seg: 60 }],
      });
    });
  });

  describe('salvarTranscricao', () => {
    it('grava os trechos, marca ok e tira o vídeo da fila', () => {
      upsertVideo(video());

      salvarTranscricao({ videoId: 'qMwY8perAQk', trechos: TRECHOS, origem: 'legenda_automatica' });

      const salvo = getVideoComTrechos('qMwY8perAQk');
      expect(salvo.origem_transcricao).toBe('legenda_automatica');
      expect(salvo.trechos.map((t) => t.texto)).toEqual(TRECHOS.map((t) => t.texto));
      expect(listarVideosPendentes()).toEqual([]);
    });

    it('substitui a transcrição anterior em vez de somar', () => {
      upsertVideo(video());
      salvarTranscricao({ videoId: 'qMwY8perAQk', trechos: TRECHOS, origem: 'legenda_automatica' });

      salvarTranscricao({
        videoId: 'qMwY8perAQk',
        trechos: [{ inicioSeg: 0, texto: 'versão nova' }],
        origem: 'legenda_automatica',
      });

      expect(getVideoComTrechos('qMwY8perAQk').trechos).toHaveLength(1);
    });

    it('recusa transcrição vazia e vídeo desconhecido', () => {
      upsertVideo(video());

      expect(() =>
        salvarTranscricao({ videoId: 'qMwY8perAQk', trechos: [], origem: 'legenda_automatica' })
      ).toThrow(/vazia/);
      expect(() =>
        salvarTranscricao({ videoId: 'nao-existe', trechos: TRECHOS, origem: 'legenda_automatica' })
      ).toThrow(/desconhecido/);
    });
  });

  it('marcarSemLegenda tira o vídeo da fila sem inventar texto', () => {
    upsertVideo(video());

    marcarSemLegenda('qMwY8perAQk');

    expect(listarVideosPendentes()).toEqual([]);
    expect(getVideoComTrechos('qMwY8perAQk')).toMatchObject({
      status_transcricao: 'sem_legenda',
      trechos: [],
    });
  });

  it('listarVideos ordena pela publicação, mais recente primeiro, com a contagem de trechos', () => {
    upsertVideo(video());
    upsertVideo(video({ videoId: 'antigo', publicadoEm: '2026-08-20T10:00:00+00:00' }));
    salvarTranscricao({ videoId: 'antigo', trechos: TRECHOS, origem: 'legenda_automatica' });

    expect(listarVideos().map((v) => [v.video_id, v.trechos])).toEqual([
      ['qMwY8perAQk', 0],
      ['antigo', 2],
    ]);
  });

  it('getVideoComTrechos retorna null para id desconhecido', () => {
    expect(getVideoComTrechos('nada')).toBeNull();
  });
});
