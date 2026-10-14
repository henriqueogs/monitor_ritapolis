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

    it('propaga o erro quando a segunda tentativa também falha', async () => {
      const fetchImpl = jest.fn().mockRejectedValue(erroFetchFailed('ECONNRESET'));

      await expect(fetchComRetry('http://api/x', {}, { fetchImpl, esperaMs: 0 })).rejects.toThrow(
        'fetch failed'
      );
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it('não repete erros que não são de rede', async () => {
      const fetchImpl = jest.fn().mockRejectedValue(new Error('outro'));

      await expect(fetchComRetry('http://api/x', {}, { fetchImpl, esperaMs: 0 })).rejects.toThrow(
        'outro'
      );
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('não repete respostas HTTP de erro', async () => {
      const resposta = { ok: false, status: 502 };
      const fetchImpl = jest.fn().mockResolvedValue(resposta);

      const resultado = await fetchComRetry('http://api/x', {}, { fetchImpl, esperaMs: 0 });

      expect(resultado).toBe(resposta);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });
  });
});
