'use strict';

/**
 * Handler fino de POST /api/ia/perguntar: valida o formato do corpo, delega ao serviço e traduz
 * erros tipados em HTTP. Nenhuma regra de negócio aqui (CLAUDE.md §2.3) e nenhuma mensagem interna
 * vaza para o cliente.
 */

const logger = require('../logger');
const { PerguntaInvalidaError, OrcamentoEsgotadoError } = require('../ai/rag/perguntar');
const { ModeloIndisponivelError, ProviderLimiteError } = require('../ai/ports/errors');

const HTTP = { BAD_REQUEST: 400, TOO_MANY: 429, BAD_GATEWAY: 502, UNAVAILABLE: 503 };
const MS_POR_SEGUNDO = 1000;

const ehObjetoSimples = v => v !== null && typeof v === 'object' && !Array.isArray(v);

function traduzirErro(err, res) {
  if (err instanceof PerguntaInvalidaError) {
    return res.status(HTTP.BAD_REQUEST).json({ error: 'pergunta_invalida', detalhe: err.message });
  }
  if (err instanceof OrcamentoEsgotadoError) {
    return res.status(HTTP.TOO_MANY).json({ error: 'limite_diario' });
  }
  if (err instanceof ProviderLimiteError) {
    if (err.retryAfterMs) {
      res.setHeader('Retry-After', Math.ceil(err.retryAfterMs / MS_POR_SEGUNDO));
    }
    return res.status(HTTP.TOO_MANY).json({ error: 'ia_sobrecarregada' });
  }
  if (err instanceof ModeloIndisponivelError) {
    return res.status(HTTP.UNAVAILABLE).json({ error: 'ia_indisponivel' });
  }
  logger.error('ia.perguntar falhou', { tipo: err?.name, status: err?.status });
  return res.status(HTTP.BAD_GATEWAY).json({ error: 'ia_falhou' });
}

function criarHandlerPerguntar({ obterServico }) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const servico = obterServico();
      if (!servico) {
        return res.status(HTTP.UNAVAILABLE).json({ error: 'ia_indisponivel' });
      }
      if (!ehObjetoSimples(req.body)) {
        return res.status(HTTP.BAD_REQUEST).json({ error: 'pergunta_invalida' });
      }
      const { pergunta, filtros } = req.body;
      return res.json(await servico.perguntar({ pergunta, filtros }));
    } catch (err) {
      return traduzirErro(err, res);
    }
  };
}

module.exports = { criarHandlerPerguntar };
