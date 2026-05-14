const express = require('express');
const cors = require('cors');
const config = require('../config');
const logger = require('../logger');
const {
  listDocumentos,
  listLicitacoes,
  getEstatisticas,
  getPainelCidadao,
  getDocumentoById,
  listColetasLog,
  getResumoAiStatus,
  createResumoAiJob,
  getResumoAiByDocumentoHash,
  getResumoAiJobById,
  getResumoAiJobsStats,
  listDocumentosParaResumoAi,
  listResumoAnalises,
  listResumoAiJobs,
  recoverStaleResumoAiJobs
} = require('../db');
const { summarizeDocument, buildTextoHash } = require('../ai/summarize-document');
const { createAiProvider } = require('../ai/providers');
const { scheduleResumoAiJobWorker } = require('../ai/summary-job-worker');
const { getAiOperationPlan } = require('../ai/operation-policy');
const { getCollectionUpdateStatus, startCollectionUpdate } = require('../coletas/update-runner');
const { compararCoberturaPrefeitura } = require('../cobertura/prefeitura');

function buildAiOperationPlan(documento) {
  return getAiOperationPlan({
    texto: documento?.texto_completo || '',
    caracteres: documento?.texto_completo_chars || 0
  });
}

function createServer() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/documentos', (req, res) => {
    const pagina = Math.max(Number(req.query.pagina || 1), 1);
    const limite = Math.min(Math.max(Number(req.query.limite || 20), 1), 100);
    const data = listDocumentos({
      fonte: req.query.fonte || undefined,
      tipo: req.query.tipo || undefined,
      ano: req.query.ano || undefined,
      status: req.query.status || undefined,
      qualidade: req.query.qualidade || undefined,
      termo: req.query.q || undefined,
      pagina,
      limite
    });

    res.json(data);
  });

  app.get('/api/licitacoes', (req, res) => {
    const pagina = Math.max(Number(req.query.pagina || 1), 1);
    const limite = Math.min(Math.max(Number(req.query.limite || 20), 1), 100);
    const data = listLicitacoes({
      fonte: req.query.fonte || undefined,
      ano: req.query.ano || undefined,
      status: req.query.status || undefined,
      termo: req.query.q || undefined,
      pagina,
      limite
    });

    res.json(data);
  });

  app.get('/api/estatisticas', (_req, res) => {
    res.json(getEstatisticas());
  });

  app.get('/api/painel-cidadao', (_req, res) => {
    res.json(getPainelCidadao());
  });

  app.get('/api/ia/resumos/status', (req, res) => {
    res.json(
      getResumoAiStatus({
        fonte: req.query.fonte || undefined,
        tipo: req.query.tipo || undefined,
        ano: req.query.ano || undefined
      })
    );
  });

  app.get('/api/ia/health', (_req, res, next) => {
    try {
      const provider = createAiProvider();
      res.json({
        ok: true,
        provider: provider.provider,
        modelo: provider.model,
        contrato_versao: config.aiContractVersion,
        enabled: config.aiSummaryEnabled
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/ia/resumos/jobs', (req, res) => {
    const limite = Math.min(Math.max(Number(req.query.limite || 20), 1), 100);
    res.json({
      stats: getResumoAiJobsStats(),
      dados: listResumoAiJobs({
        limite,
        status: req.query.status || undefined
      })
    });
  });

  app.post('/api/ia/resumos/jobs/lote', (req, res) => {
    try {
      const limite = Math.min(Math.max(Number(req.body?.limite || 5), 1), 50);
      const maxChars = req.body?.maxChars ? Number(req.body.maxChars) : null;
      const minChars = req.body?.minChars ? Number(req.body.minChars) : null;
      const fonte = req.body?.fonte || undefined;
      const tipo = req.body?.tipo || undefined;
      const ano = req.body?.ano || undefined;
      const documentos = listDocumentosParaResumoAi({
        limite,
        maxChars,
        minChars,
        fonte,
        tipo,
        ano,
        contratoVersao: config.aiContractVersion
      });
      const provider = documentos.length ? createAiProvider() : null;

      const jobs = documentos.map((documento) =>
        createResumoAiJob({
          documento_id: documento.id,
          provider: provider.provider,
          modelo: provider.model,
          contrato_versao: config.aiContractVersion,
          texto_hash: buildTextoHash(documento.texto_completo),
          force: false
        })
      );

      if (jobs.length) {
        scheduleResumoAiJobWorker();
      }

      res.status(202).json({
        status: jobs.length ? 'enfileirado' : 'sem_pendencias',
        total_enfileirado: jobs.length,
        filtros: {
          limite,
          maxChars,
          minChars,
          fonte: fonte || null,
          tipo: tipo || null,
          ano: ano || null
        },
        jobs,
        documentos: documentos.map((documento) => ({
          id: documento.id,
          titulo: documento.titulo,
          ano: documento.ano,
          tipo: documento.tipo,
          fonte: documento.fonte,
          texto_chars: documento.texto_completo?.length || 0
        }))
      });
    } catch (error) {
      logger.error('Falha ao enfileirar lote de resumos IA', { erro: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/ia/resumos/jobs/recover', (req, res) => {
    const staleMinutes = Math.min(Math.max(Number(req.body?.staleMinutes || 30), 1), 1440);
    res.json(recoverStaleResumoAiJobs({ staleMinutes }));
  });

  app.get('/api/documentos/:id', (req, res) => {
    recoverStaleResumoAiJobs({ staleMinutes: 5 });
    const documento = getDocumentoById(Number(req.params.id));
    if (!documento) {
      return res.status(404).json({ error: 'Documento nao encontrado' });
    }

    return res.json({
      ...documento,
      resumo_ai_operacao: buildAiOperationPlan(documento)
    });
  });

  app.post('/api/documentos/:id/resumir', async (req, res) => {
    try {
      recoverStaleResumoAiJobs({ staleMinutes: 5 });
      const force = req.body?.force === true || String(req.query.force || '').toLowerCase() === 'true';
      const documento = getDocumentoById(Number(req.params.id));
      if (!documento) {
        return res.status(404).json({ error: 'Documento nao encontrado' });
      }
      if (!documento.texto_completo) {
        return res.status(400).json({ error: `Documento ${documento.id} nao possui texto_completo para resumir` });
      }

      const textoHash = buildTextoHash(documento.texto_completo);
      const cached = getResumoAiByDocumentoHash(documento.id, textoHash, config.aiContractVersion);
      if (cached?.status === 'ok' && !force) {
        const result = await summarizeDocument(documento.id, { force: false });
        return res.json({
          ...result,
          forcar_regeneracao: false
        });
      }

      const provider = createAiProvider();
      const job = createResumoAiJob({
        documento_id: documento.id,
        provider: provider.provider,
        modelo: provider.model,
        contrato_versao: config.aiContractVersion,
        texto_hash: textoHash,
        force
      });

      scheduleResumoAiJobWorker();

      return res.status(202).json({
        status: job.status,
        job,
        mensagem: 'Resumo de IA enfileirado para processamento assincrono.'
      });
    } catch (error) {
      const statusCode = /nao encontrado|nao possui texto_completo|AI_SUMMARY_ENABLED=false/i.test(error.message)
        ? 400
        : 500;
      logger.error('Falha no endpoint de resumo IA', {
        documentoId: req.params.id,
        erro: error.message
      });
      res.status(statusCode).json({ error: error.message });
    }
  });

  app.get('/api/ia/resumos/jobs/:id', (req, res) => {
    const job = getResumoAiJobById(Number(req.params.id));
    if (!job) {
      return res.status(404).json({ error: 'Job de resumo nao encontrado' });
    }

    return res.json({ job });
  });

  app.get('/api/analises/resumos', (req, res) => {
    res.json(
      listResumoAnalises({
        tipo: req.query.tipo || undefined,
        limite: req.query.limite || 50
      })
    );
  });

  app.get('/api/cobertura/prefeitura', async (req, res, next) => {
    try {
      const limite = Math.min(Math.max(Number(req.query.limite || 500), 1), 2000);
      const data = await compararCoberturaPrefeitura({ limite });
      res.json(data);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/coletas/log', (req, res) => {
    const limite = Math.min(Math.max(Number(req.query.limite || 10), 1), 50);
    res.json({ dados: listColetasLog(limite) });
  });

  app.get('/api/coletas/atualizacao/status', (_req, res) => {
    res.json(getCollectionUpdateStatus());
  });

  app.post('/api/coletas/atualizar', (req, res) => {
    try {
      const fonte = req.body?.fonte || req.query.fonte || 'todas';
      const result = startCollectionUpdate({ fonte });
      res.status(result.started ? 202 : 409).json(result.status);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.use((error, _req, res, _next) => {
    logger.error('Erro inesperado na API', { erro: error.message, stack: error.stack });
    res.status(500).json({ error: 'Erro interno do servidor' });
  });

  return app;
}

function startServer() {
  const app = createServer();
  return app.listen(config.apiPort, config.apiHost, () => {
    logger.info('API iniciada', {
      host: config.apiHost,
      port: config.apiPort
    });
  });
}

module.exports = {
  createServer,
  startServer
};
