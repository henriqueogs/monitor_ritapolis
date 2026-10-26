'use strict';

const { fetchComRetry, descreverErroDeRede, isErroDeRede } = require('../frontend/lib/fetch-retry');

function erroFetchFailed(code) {
  const causa = Object.assign(new Error('other side closed'), { code });
  return new TypeError('fetch failed', { cause: causa });
}

describe('frontend fetch-retry', () => {
  describe('isErroDeRede', () => {
    it('reconhece o TypeError "fetch failed" do undici', () => {
      expect(isErroDeRede(erroFetchFailed('UND_ERR_SOCKET'))).toBe(true);
    });

    it('não trata outros erros como erro de rede', () => {
      expect(isErroDeRede(new Error('qualquer'))).toBe(false);
      expect(isErroDeRede(new DOMException('aborted', 'AbortError'))).toBe(false);
      expect(isErroDeRede(undefined)).toBe(false);
    });
  });

  describe('descreverErroDeRede', () => {
    it('inclui o código da causa na mensagem', () => {
      expect(descreverErroDeRede(erroFetchFailed('ECONNRESET'))).toBe('fetch failed (ECONNRESET)');
    });

    it('usa a mensagem da causa quando ela não tem código', () => {
      const erro = new TypeError('fetch failed', { cause: new Error('socket hang up') });

      expect(descreverErroDeRede(erro)).toBe('fetch failed (socket hang up)');
    });

    it('mantém a mensagem original quando não há causa', () => {
      expect(descreverErroDeRede(new Error('boom'))).toBe('boom');
    });
  });

  describe('fetchComRetry', () => {
    it('repete uma vez quando a primeira tentativa falha por erro de rede', async () => {
      // Arrange
      const resposta = { ok: true };
      const fetchImpl = jest
        .fn()
        .mockRejectedValueOnce(erroFetchFailed('UND_ERR_SOCKET'))
        .mockResolvedValueOnce(resposta);

      // Act
      const resultado = await fetchComRetry('http://api/x', {}, { fetchImpl, esperaMs: 0 });

      // Assert
      expect(resultado).toBe(resposta);
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it('repete até a terceira tentativa em erro de rede (vários sockets velhos no pool)', async () => {
      // Arrange: função da Vercel descongelada com mais de um socket keep-alive morto
      const resposta = { ok: true };
      const fetchImpl = jest
        .fn()
        .mockRejectedValueOnce(erroFetchFailed('UND_ERR_SOCKET'))
        .mockRejectedValueOnce(erroFetchFailed('ETIMEDOUT'))
        .mockResolvedValueOnce(resposta);

      // Act
      const resultado = await fetchComRetry('http://api/x', {}, { fetchImpl, esperaMs: 0 });

      // Assert
      expect(resultado).toBe(resposta);
      expect(fetchImpl).toHaveBeenCalledTimes(3);
    });

    it('propaga o erro quando a terceira tentativa também falha', async () => {
      const fetchImpl = jest.fn().mockRejectedValue(erroFetchFailed('ECONNRESET'));

      await expect(fetchComRetry('http://api/x', {}, { fetchImpl, esperaMs: 0 })).rejects.toThrow(
        'fetch failed'
      );
      expect(fetchImpl).toHaveBeenCalledTimes(3);
    });

    it('não repete erros que não são de rede', async () => {
      const fetchImpl = jest.fn().mockRejectedValue(new Error('outro'));

      await expect(fetchComRetry('http://api/x', {}, { fetchImpl, esperaMs: 0 })).rejects.toThrow(
        'outro'
      );
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('não repete respostas HTTP de erro da aplicação (4xx/500)', async () => {
      const resposta = { ok: false, status: 500 };
      const fetchImpl = jest.fn().mockResolvedValue(resposta);

      const resultado = await fetchComRetry('http://api/x', {}, { fetchImpl, esperaMs: 0 });

      expect(resultado).toBe(resposta);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it.each([502, 503, 504])('repete uma vez quando o proxy responde %i (API reiniciando)', async (status) => {
      // Arrange
      const ok = { ok: true, status: 200 };
      const fetchImpl = jest.fn().mockResolvedValueOnce({ ok: false, status }).mockResolvedValueOnce(ok);

      // Act
      const resultado = await fetchComRetry('http://api/x', {}, { fetchImpl, esperaMs: 0, esperaGatewayMs: 0 });

      // Assert
      expect(resultado).toBe(ok);
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it('devolve a última resposta 502 quando a repetição também falha', async () => {
      const resposta = { ok: false, status: 502 };
      const fetchImpl = jest.fn().mockResolvedValue(resposta);

      const resultado = await fetchComRetry('http://api/x', {}, { fetchImpl, esperaMs: 0, esperaGatewayMs: 0 });

      expect(resultado).toBe(resposta);
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    });
  });
});
