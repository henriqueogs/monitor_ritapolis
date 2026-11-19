'use strict';

const { parseFeedYoutube, classificarVideo, montarTrechos, urlNoInstante } = require('./videos');

const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns="http://www.w3.org/2005/Atom">
 <title>Câmara Exemplo</title>
 <entry>
  <yt:videoId>qMwY8perAQk</yt:videoId>
  <title>16ª Sessão Ordinária da 2ª Sessão Legislativa da 16ª Legislatura</title>
  <published>2026-11-05T13:25:40+00:00</published>
 </entry>
 <entry>
  <yt:videoId>90qLMMJ6Zik</yt:videoId>
  <title>Preg&#227;o 001/26 &amp; anexos</title>
  <published>2026-08-26T20:46:00+00:00</published>
 </entry>
</feed>`;

describe('videos da Câmara', () => {
  describe('parseFeedYoutube', () => {
    it('extrai id, título e data de cada vídeo, sem o título do canal', () => {
      const videos = parseFeedYoutube(FEED);

      expect(videos).toHaveLength(2);
      expect(videos[0]).toEqual({
        videoId: 'qMwY8perAQk',
        titulo: '16ª Sessão Ordinária da 2ª Sessão Legislativa da 16ª Legislatura',
        publicadoEm: '2026-11-05T13:25:40+00:00',
      });
    });

    it('decodifica entidades do título', () => {
      expect(parseFeedYoutube(FEED)[1].titulo).toBe('Pregão 001/26 & anexos');
    });

    it('retorna lista vazia para resposta que não é feed', () => {
      expect(parseFeedYoutube('<html>erro</html>')).toEqual([]);
    });
  });

  describe('classificarVideo', () => {
    it('reconhece sessão ordinária e o número', () => {
      expect(
        classificarVideo('16ª Sessão Ordinária da 2ª Sessão Legislativa da 16ª Legislatura')
      ).toEqual({ tipo: 'sessao_ordinaria', numero: 16 });
    });

    it('reconhece sessão extraordinária', () => {
      expect(classificarVideo('2ª Sessão Extraordinária da 2ª Sessão Legislativa')).toEqual({
        tipo: 'sessao_extraordinaria',
        numero: 2,
      });
    });

    it('reconhece audiência pública, sem número', () => {
      expect(classificarVideo('Audiência Pública 2º Quadrimestre de 2026')).toEqual({
        tipo: 'audiencia_publica',
        numero: null,
      });
    });

    it('classifica o resto como outro', () => {
      expect(classificarVideo('Pregão 001/26')).toEqual({ tipo: 'outro', numero: null });
    });
  });

  describe('montarTrechos', () => {
    const evento = (inicioMs, texto) => ({ tStartMs: inicioMs, segs: [{ utf8: texto }] });

    it('junta as falas em blocos de um minuto, guardando o início de cada bloco', () => {
      const trechos = montarTrechos([
        evento(1000, 'declaro aberta'),
        evento(30000, ' a sessão'),
        evento(61000, 'em votação'),
      ]);

      expect(trechos).toEqual([
        { inicioSeg: 1, texto: 'declaro aberta a sessão' },
        { inicioSeg: 61, texto: 'em votação' },
      ]);
    });

    it('ignora eventos sem fala e quebras de linha soltas', () => {
      const trechos = montarTrechos([{ tStartMs: 0 }, evento(500, '\n'), evento(900, 'bom dia')]);

      expect(trechos).toEqual([{ inicioSeg: 0, texto: 'bom dia' }]);
    });

    it('retorna lista vazia sem eventos', () => {
      expect(montarTrechos(null)).toEqual([]);
    });
  });

  describe('urlNoInstante', () => {
    it('aponta para o segundo exato do vídeo', () => {
      expect(urlNoInstante('https://www.youtube.com/watch?v=abc', 125)).toBe(
        'https://www.youtube.com/watch?v=abc&t=125s'
      );
    });
  });
});
