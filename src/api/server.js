const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { Readable } = require('stream');
const config = require('../config');
const logger = require('../logger');
const security = require('./security');
const {
  listDocumentos,
  listLicitacoes,
  listLicitacaoProdutos,
  getLicitacaoProdutosByDocumentoId,
  getLicitacaoAnaliseAnual,
  listLicitacaoFontesRelacionadas,
  listLicitacaoFontesRelacionadasByDocumentoId,
  updateLicitacaoFonteRelacionadaStatus,
  getLicitacaoGrupoByDocumentoId,
  syncLicitacoesGrupos,
  getEstatisticas,
  getPainelCidadao,
  getDocumentoById,
  listColetasLog,
  getResumoAiStatus,
  getAuditoria,
  getFornecedoresRanking,
  getProdutosGruposComparaveis,
  getEvolucaoPrecoGrupo,
  getInteligenciaPanorama,
  getCoberturaPorAno,
  getCategoriasStats,
  listCategoriasDocumentos,
  createResumoAiJob,
  getResumoAiByDocumentoHash,
  getResumoAiJobById,
  getResumoAiJobsStats,
  listDocumentosParaResumoAi,
  listResumoAnalises,
  listResumoAiJobs,
  recoverStaleResumoAiJobs,
  listarAnexosDocumento,
  getAnexoById,
  listarFatosDocumento,
  listarFatosAnexo
} = require('../db');
const {
  getResumoFinanceiroPorDocumento,
  getReceitasPorAno,
  getReceitasDetalheExercicio,
  getFilaPagamentos,
} = require('../db/transparencia-repo');
const {
  getPainelTransparencia,
  getDespesasComPortal,
  getDespesasDocumentoComPortal,
} = require('../transparencia/painel-service');
const { getCredorDossie } = require('../transparencia/credor-service');
const { parseCredorChave } = require('../transparencia/credor-chave');
const { buscaUnificada } = require('../busca/busca-unificada');
const { getEmpenhoDossie } = require('../transparencia/empenho-service');
const { getGastosPanorama, getCategoriaDossie } = require('../transparencia/gastos-service');
const { getFinalidadesResumo, getFinalidadeDossie, resolverExercicios } = require('../transparencia/finalidade-service');
const { slugParaPrefixos } = require('../transparencia/categorias');
const { FINALIDADES } = require('../transparencia/finalidade');
const {
  getConcentracaoCredores,
  getConcentracaoHistorico,
  getEmpenhoAtipicos,
  getEvolucaoFuncoes,
  getRankingPorFuncao,
  getPainelInteligencia,
} = require('../db/inteligencia-repo');
const { summarizeDocument, buildTextoHash } = require('../ai/summarize-document');
const { correlateLicitation } = require('../ai/correlate-licitation');
const { createAiProvider } = require('../ai/providers');
const { scheduleResumoAiJobWorker } = require('../ai/summary-job-worker');
const { getAiOperationPlan } = require('../ai/operation-policy');
const { extractEntitiesFromResumes } = require('../ai/extract-entities');
const { gerarNarrativaAnomalias } = require('../ai/anomaly-narrative');
const alertasRepo = require('../db/alertas-repo');
const { generateAlerts, getAlertasStatus } = require('../alertas/alert-generator');
const { extrairFatosInteligencia } = require('../inteligencia/fatos-runner');
const {
  createAnexoResumoJob,
  getAnexoResumoJobById,
  recoverStaleAnexoResumoJobs,
} = require('../db/anexo-resumo-jobs-repo');
const { scheduleAnexoResumoJobWorker } = require('../ai/anexo-summary-job-worker');
const { CONTRACT_VERSION_IA: CONTRATO_ANEXO_IA } = require('../ai/summarize-anexo');
const { enfileirarItensPendentes } = require('../ai/enfileirar-itens-pendentes');
const { scheduleItensProcessoJobWorker } = require('../ai/itens-processo-job-worker');
const {
  recoverStaleItensEstruturacaoJobs,
  getItensEstruturacaoJobById,
} = require('../db/itens-estruturacao-jobs-repo');
const { getCollectionUpdateStatus, startCollectionUpdate } = require('../coletas/update-runner');
const { listCredores } = require('../db/credores-repo');
const { searchDocumentos, ensureFtsIndex, rebuildFtsIndex } = require('../db/fts-repo');
const { ensureDespesasFtsIndex } = require('../db/fts-despesas-repo');
const {
  listarEmendas,
  contarEmendas,
  getEmendaById,
  totaisPorAno,
  parlamentaresComTotais,
} = require('../db/emendas-repo');
const { getAdminSnapshot } = require('../db/admin-repo');
const adminAuthRepo = require('../db/admin-auth-repo');
const adminSession = require('../auth/admin-session');
const { listarFerramentas, executarFerramenta, lerStatusProgresso } = require('./admin-tarefas');
const {
  contarProdutosRevisao,
  listProdutosParaRevisao,
  setProdutoStatusRevisao,
  validarLoteProdutos,
} = require('../db/produtos-revisao-repo');
const dailyScheduler = require('../coletas/daily-scheduler');
const { checkPrefeituraSyncOnPortalOpen } = require('../coletas/prefeitura-sync');
const collectionScheduler = require('../coletas/collection-scheduler');
const aiScheduler = require('../ai/ai-daily-scheduler');
const descobertasScheduler = require('../inteligencia/descobertas-scheduler');
const { reprocessarInvestigacoesPendentes } = require('../inteligencia/discovery-investigation-runner');
const {
  compararCoberturaPrefeitura,
  getCoberturaPrefeituraSourceLinks,
  getPrefeituraAreas
} = require('../cobertura/prefeitura');

const SOURCE_PREVIEW_HOSTS = new Set(['ritapolis.mg.gov.br', 'www.ritapolis.mg.gov.br']);
const SOURCE_PREVIEW_REDIRECTS = new Set([301, 302, 303, 307, 308]);
const SOURCE_PREVIEW_MAX_REDIRECTS = 3;

function parseSourcePreviewUrl(value) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    const path = url.pathname.toLowerCase();
    const allowedPath = path === '/obter_arquivo_cadastro_generico.php' || path.endsWith('.pdf');
    if (url.protocol !== 'https:' || !SOURCE_PREVIEW_HOSTS.has(url.hostname) || !allowedPath) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

async function fetchSourcePreview(url) {
  const proxyUrl = String(process.env.COLLECTOR_PROXY_URL || '').trim();
  const proxyToken = String(process.env.COLLECTOR_PROXY_TOKEN || '').trim();

  // O Worker já é autorizado pelo portal e evita bloqueios de IP do Render.
  // O destino continua validado por parseSourcePreviewUrl antes desta função.
  if (proxyUrl && proxyToken) {
    return fetch(proxyUrl, {
      headers: {
        Accept: 'application/pdf',
        Authorization: `Bearer ${proxyToken}`,
        'User-Agent': 'Ritapolis-com/1.0 (+https://ritapolis.com)',
        'X-Target-Url': url.toString(),
      },
      redirect: 'manual',
    });
  }

  let currentUrl = url;
  for (let attempt = 0; attempt <= SOURCE_PREVIEW_MAX_REDIRECTS; attempt += 1) {
    const response = await fetch(currentUrl, {
      headers: {
        Accept: 'application/pdf',
        'User-Agent': 'Ritapolis-com/1.0 (+https://ritapolis.com)',
      },
      redirect: 'manual',
    });
    if (!SOURCE_PREVIEW_REDIRECTS.has(response.status)) {
      return response;
    }

    const location = response.headers.get('location');
    const nextUrl = parseSourcePreviewUrl(location ? new URL(location, currentUrl).toString() : null);
    if (!nextUrl) {
      return null;
    }
    currentUrl = nextUrl;
  }
  return null;
}

function buildAiOperationPlan(documento) {
  return getAiOperationPlan({
    texto: documento?.texto_completo || '',
    caracteres: documento?.texto_completo_chars || 0
  });
}

function stripKeys(value, keys) {
  if (!value || typeof value !== 'object') {return value;}
  const clone = Array.isArray(value) ? value.map((item) => stripKeys(item, keys)) : { ...value };
  if (!Array.isArray(clone)) {
    for (const key of keys) {
      delete clone[key];
    }
    for (const [key, child] of Object.entries(clone)) {
      clone[key] = stripKeys(child, keys);
    }
  }
  return clone;
}

function resumoAiPublico(resumoAi) {
  if (!resumoAi) {return null;}
  return {
    criado_em: resumoAi.criado_em,
    atualizado_em: resumoAi.atualizado_em,
    dados: stripKeys(resumoAi.dados, ['trecho_fonte', 'origem_detalhe', 'payload_json', 'contrato_versao'])
  };
}

function leituraIntegradaPublica(leitura) {
  if (!leitura) {return null;}
  return {
    criado_em: leitura.criado_em,
    atualizado_em: leitura.atualizado_em,
    dados: stripKeys(leitura.dados, ['fontes', 'fontes_usadas', 'fonte', 'trecho_fonte', 'origem_detalhe', 'payload_json', 'contrato_versao'])
  };
}

function documentoPublico(documento) {
  const publico = { ...documento };
  delete publico.texto_completo;
  delete publico.texto_hash_atual;
  delete publico.texto_completo_chars;
  delete publico.hash_conteudo;
  delete publico.resumo_ai_job;
  delete publico.resumo_ai_operacao;
  delete publico.fatos;

  return {
    ...stripKeys(publico, [
      'texto_completo',
      'texto_hash',
      'texto_completo_chars',
      'texto_origem',
      'hash_conteudo',
      'hash_item',
      'origem_detalhe',
      'trecho_fonte',
      'payload_json',
      'provider',
      'modelo',
      'contrato_versao',
      'resumo_provider',
      'resumo_modelo',
      'resumo_contrato_versao',
      'resumo_texto_hash'
    ]),
    licitacao_detalhes: publico.licitacao_detalhes
      ? stripKeys(publico.licitacao_detalhes, ['origem_detalhe', 'trecho_fonte', 'confianca'])
      : publico.licitacao_detalhes,
    resumo_ai: resumoAiPublico(publico.resumo_ai),
    leitura_integrada_ai: leituraIntegradaPublica(publico.leitura_integrada_ai)
  };
}

function anexoPublico(anexo) {
  const publico = { ...anexo };
  delete publico.texto_completo;
  delete publico.texto_completo_chars;
  delete publico.texto_hash;
  delete publico.hash_conteudo;
  return stripKeys(publico, [
    'texto_completo',
    'texto_hash',
    'texto_completo_chars',
    'hash_conteudo',
    'trecho_fonte',
    'payload_json',
    'provider',
    'modelo',
    'contrato_versao',
    'resumo_provider',
    'resumo_modelo',
    'resumo_contrato_versao',
    'resumo_texto_hash'
  ]);
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

function validateBootstrapToken(token, env = process.env) {
  if (env.NODE_ENV !== 'production') {
    return { ok: true };
  }
  if (!env.ADMIN_BOOTSTRAP_TOKEN) {
    return { ok: false, status: 503, error: 'Token de bootstrap admin nao configurado' };
  }
  if (!safeEqual(token, env.ADMIN_BOOTSTRAP_TOKEN)) {
    return { ok: false, status: 403, error: 'Token de bootstrap admin invalido' };
  }
  return { ok: true };
}

function createServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(security.applySecurityHeaders);
  app.use(cors(security.corsOptions));
  app.use(security.rateLimit);
  app.use(security.validateOrigin);
  app.use(security.applyCachePolicy);
  app.use(security.requireAdmin);
  app.use(express.json({ limit: security.getJsonLimit() }));

  // Inicializa índices FTS5 se ainda não populados (apenas no primeiro start)
  try {
    const ftsResult = ensureFtsIndex();
    if (ftsResult.rebuiltRows > 0) {
      logger.info('FTS5: índice de documentos reconstruído', { linhas: ftsResult.rebuiltRows });
    }
    const ftsDespesas = ensureDespesasFtsIndex();
    if (ftsDespesas.rebuiltRows > 0) {
      logger.info('FTS5: índice de empenhos reconstruído', { linhas: ftsDespesas.rebuiltRows });
    }
  } catch (err) {
    logger.warn('FTS5: falha ao inicializar índice', { erro: err.message });
  }

  // Proxy público restrito aos PDFs do portal oficial. O portal bloqueia
  // incorporação cross-site em navegadores móveis e também rejeita alguns
  // IPs de infraestrutura do Vercel; a API Render faz a busca server-side.
  app.get('/api/source-preview', async (req, res) => {
    const targetUrl = parseSourcePreviewUrl(req.query?.url);
    if (!targetUrl) {
      return res.status(400).send('Fonte oficial inválida.');
    }

    let upstream;
    try {
      upstream = await fetchSourcePreview(targetUrl);
    } catch (err) {
      logger.warn('Preview da fonte oficial indisponível', { erro: err.message });
      return res.status(502).send('Não foi possível carregar a fonte oficial.');
    }

    if (!upstream || !upstream.ok || !upstream.body) {
      return res.status(502).send('A fonte oficial está indisponível no momento.');
    }

    const contentType = upstream.headers.get('content-type') || 'application/pdf';
    if (!/^application\/(pdf|octet-stream)(?:\s*;|$)/i.test(contentType)) {
      return res.status(502).send('A fonte oficial não retornou um arquivo PDF.');
    }

    // Esse endpoint é usado exclusivamente como iframe do site público.
    // Sobrescrevemos os defaults globais (DENY/same-site) apenas aqui.
    res.removeHeader('X-Frame-Options');
    res.setHeader('Content-Security-Policy', 'frame-ancestors https://ritapolis.com https://www.ritapolis.com');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=86400, stale-while-revalidate=3600');
    res.setHeader('Content-Disposition', 'inline; filename="fonte-oficial.pdf"');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Robots-Tag', 'noindex');

    const contentLength = upstream.headers.get('content-length');
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }
    return Readable.fromWeb(upstream.body).pipe(res);
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/auth/session', (req, res) => {
    const token = adminSession.getSessionTokenFromRequest(req);
    const session = adminAuthRepo.getAdminSession(token);
    res.setHeader('Cache-Control', 'no-store');
    if (!session) {
      return res.json({
        authenticated: false,
        bootstrapRequired: adminAuthRepo.countAdminUsers() === 0,
      });
    }
    return res.json({
      authenticated: true,
      user: session.user,
      expiresAt: session.expiresAt,
      bootstrapRequired: false,
    });
  });

  app.post('/api/auth/bootstrap', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (adminAuthRepo.countAdminUsers() > 0) {
      return res.status(409).json({ error: 'Usuario administrador inicial ja existe' });
    }

    const bootstrapToken = validateBootstrapToken(req.body?.bootstrapToken, process.env);
    if (!bootstrapToken.ok) {
      return res.status(bootstrapToken.status).json({ error: bootstrapToken.error });
    }

    try {
      const user = adminAuthRepo.createAdminUser({
        username: req.body?.username,
        password: req.body?.password,
      });
      const session = adminAuthRepo.createAdminSession({
        userId: user.id,
        userAgent: req.get('user-agent') || null,
        ip: req.ip,
        ttlMs: adminSession.getSessionTtlMs(process.env),
      });
      res.setHeader('Set-Cookie', adminSession.buildSessionCookie(session.token, process.env));
      return res.status(201).json({ authenticated: true, user, expiresAt: session.expiresAt });
    } catch (err) {
      return res.status(400).json({ error: err.message || 'Falha ao criar administrador' });
    }
  });

  app.post('/api/auth/reset', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const bootstrapToken = validateBootstrapToken(req.body?.bootstrapToken, process.env);
    if (!bootstrapToken.ok) {
      return res.status(bootstrapToken.status).json({ error: bootstrapToken.error });
    }

    try {
      const user = adminAuthRepo.resetAdminPassword({
        username: req.body?.username,
        password: req.body?.password,
      });
      logger.info('Senha administrativa redefinida via fluxo de recuperacao', {
        username: user.username,
        ip: req.ip,
      });
      return res.json({ reset: true, user });
    } catch (err) {
      return res.status(400).json({ error: err.message || 'Falha ao redefinir senha' });
    }
  });

  app.post('/api/auth/login', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const resultado = adminAuthRepo.verifyAdminLogin({
      username: req.body?.username,
      password: req.body?.password,
    });
    if (resultado.locked) {
      res.setHeader('Retry-After', resultado.retryAfterSec);
      logger.warn('Seguranca: login admin bloqueado por tentativas', {
        username: adminAuthRepo.normalizeUsername(req.body?.username),
        ip: req.ip,
      });
      return res.status(429).json({ error: 'Conta temporariamente bloqueada por excesso de tentativas' });
    }
    const user = resultado.user;
    if (!user) {
      logger.warn('Seguranca: login admin negado', {
        username: adminAuthRepo.normalizeUsername(req.body?.username),
        ip: req.ip,
      });
      return res.status(401).json({ error: 'Usuario ou senha invalidos' });
    }

    const session = adminAuthRepo.createAdminSession({
      userId: user.id,
      userAgent: req.get('user-agent') || null,
      ip: req.ip,
      ttlMs: adminSession.getSessionTtlMs(process.env),
    });
    res.setHeader('Set-Cookie', adminSession.buildSessionCookie(session.token, process.env));
    return res.json({ authenticated: true, user, expiresAt: session.expiresAt });
  });

  app.post('/api/auth/logout', (req, res) => {
    const token = adminSession.getSessionTokenFromRequest(req);
    adminAuthRepo.revokeAdminSession(token);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Set-Cookie', adminSession.buildExpiredSessionCookie(process.env));
    return res.json({ ok: true });
  });

  app.get('/api/scheduler/status', (_req, res) => {
    res.json({
      coletas: collectionScheduler.getStatus(),
      ia: aiScheduler.getStatus(),
      alertas: getAlertasStatus(),
      descobertas: descobertasScheduler.getStatus()
    });
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
      categoria: req.query.categoria || undefined,
      fornecedor: req.query.fornecedor || undefined,
      pagina,
      limite
    });

    res.json(data);
  });

  app.get('/api/licitacoes/analise-anual', (req, res) => {
    res.json(
      getLicitacaoAnaliseAnual({
        ano: req.query.ano || undefined
      })
    );
  });

  app.get('/api/licitacoes/produtos', (req, res) => {
    const pagina = Math.max(Number(req.query.pagina || 1), 1);
    const limite = Math.min(Math.max(Number(req.query.limite || 20), 1), 100);
    res.json(
      listLicitacaoProdutos({
        ano: req.query.ano || undefined,
        termo: req.query.q || undefined,
        origem: req.query.origem || undefined,
        validacao: req.query.validacao || undefined,
        pagina,
        limite
      })
    );
  });

  app.get('/api/licitacoes/fontes-relacionadas', (req, res) => {
    const pagina = Math.max(Number(req.query.pagina || 1), 1);
    const limite = Math.min(Math.max(Number(req.query.limite || 20), 1), 100);
    res.json(
      listLicitacaoFontesRelacionadas({
        ano: req.query.ano || undefined,
        status: req.query.status || undefined,
        fonte: req.query.fonte || undefined,
        pagina,
        limite
      })
    );
  });

  app.patch('/api/licitacoes/fontes-relacionadas/:id', (req, res, next) => {
    try {
      const fonteRelacionada = updateLicitacaoFonteRelacionadaStatus(
        Number(req.params.id),
        req.body?.status_correspondencia || req.body?.status
      );

      if (!fonteRelacionada) {
        return res.status(404).json({ error: 'Fonte relacionada nao encontrada' });
      }

      return res.json(fonteRelacionada);
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/licitacoes/:id/produtos', (req, res) => {
    const data = getLicitacaoProdutosByDocumentoId(Number(req.params.id));
    res.json(data);
  });

  // Comparação histórica de preços — grupos de produtos equivalentes (3.3)
  app.get('/api/produtos/grupos-comparaveis', (req, res) => {
    res.json({ dados: getProdutosGruposComparaveis({ limite: req.query.limite || undefined }) });
  });

  app.get('/api/produtos/grupos/:id/evolucao', (req, res) => {
    const data = getEvolucaoPrecoGrupo(Number(req.params.id));
    if (!data) {
      return res.status(404).json({ error: 'Grupo de produto nao encontrado' });
    }
    return res.json(data);
  });

  app.get('/api/licitacoes/:id/fontes-relacionadas', (req, res) => {
    const data = listLicitacaoFontesRelacionadasByDocumentoId(Number(req.params.id));
    res.json({
      total: data.length,
      dados: data
    });
  });

  app.get('/api/licitacoes/:id/grupo', (req, res) => {
    const grupo = getLicitacaoGrupoByDocumentoId(Number(req.params.id));
    if (!grupo) {
      return res.status(404).json({ error: 'Grupo de licitacao nao encontrado para este documento' });
    }
    res.json(grupo);
  });

  app.post('/api/licitacoes/agrupar', (req, res) => {
    res.json(
      syncLicitacoesGrupos({
        ano: req.body?.ano || req.query?.ano || undefined
      })
    );
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

  app.get('/api/documentos/:id/empenhos', (req, res) => {
    const id = Number(req.params.id);
    const documento = getDocumentoById(id);
    if (!documento) { return res.status(404).json({ error: 'Documento nao encontrado' }); }

    const resumo = getResumoFinanceiroPorDocumento(id);
    const empenhos = getDespesasDocumentoComPortal(id);

    return res.json({ resumo, empenhos });
  });

  // ── Portal da Transparência ───────────────────────────────────────────────

  app.get('/api/transparencia/resumo', (req, res) => {
    const exercicio = req.query.exercicio ? Number(req.query.exercicio) : undefined;
    const mandato = req.query.mandato ? Number(req.query.mandato) : undefined;
    return res.json(getPainelTransparencia({ exercicio, mandato }));
  });

  app.get('/api/transparencia/despesas', (req, res) => {
    const { exercicio, mandato, credor_cnpj, documento_id, categoria, finalidade, q, pagina, limite } = req.query;
    const categoriaPrefixos = categoria ? slugParaPrefixos(categoria) : undefined;
    const exercicios = !exercicio && mandato ? resolverExercicios({ mandato: Number(mandato) }) : undefined;
    if (categoria && !categoriaPrefixos) { return res.status(400).json({ error: 'Categoria desconhecida' }); }
    if (finalidade && !FINALIDADES[finalidade]) { return res.status(400).json({ error: 'Finalidade desconhecida' }); }
    return res.json(
      getDespesasComPortal({ exercicio, exercicios, credor_cnpj, documento_id, categoriaPrefixos, finalidade, q, pagina, limite })
    );
  });

  app.get('/api/transparencia/gastos', (req, res) => {
    const exercicio = req.query.exercicio ? Number(req.query.exercicio) : undefined;
    const mandato = req.query.mandato ? Number(req.query.mandato) : undefined;
    return res.json(getGastosPanorama({ exercicio, mandato }));
  });

  app.get('/api/transparencia/finalidades', (req, res) => {
    const exercicio = req.query.exercicio ? Number(req.query.exercicio) : undefined;
    const mandato = req.query.mandato ? Number(req.query.mandato) : undefined;
    return res.json(getFinalidadesResumo({ exercicio, mandato }));
  });

  app.get('/api/transparencia/finalidades/:classe', (req, res) => {
    const exercicio = req.query.exercicio ? Number(req.query.exercicio) : undefined;
    const mandato = req.query.mandato ? Number(req.query.mandato) : undefined;
    const dossie = getFinalidadeDossie(req.params.classe, { exercicio, mandato });
    if (!dossie) { return res.status(404).json({ error: 'Finalidade nao encontrada' }); }
    return res.json(dossie);
  });

  app.get('/api/transparencia/categoria/:slug', (req, res) => {
    const exercicio = req.query.exercicio ? Number(req.query.exercicio) : undefined;
    const mandato = req.query.mandato ? Number(req.query.mandato) : undefined;
    const dossie = getCategoriaDossie(req.params.slug, { exercicio, mandato });
    if (!dossie) { return res.status(404).json({ error: 'Categoria não encontrada' }); }
    return res.json(dossie);
  });

  app.get('/api/empenhos/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) { return res.status(400).json({ error: 'ID inválido' }); }
    const dossie = getEmpenhoDossie(id);
    if (!dossie) { return res.status(404).json({ error: 'Empenho não encontrado' }); }
    return res.json(dossie);
  });

  // GET /api/transparencia/fila-pagamentos — empenhos liquidados aguardando
  // pagamento ("quem está esperando receber"), mais antigos primeiro.
  app.get('/api/transparencia/fila-pagamentos', (req, res) => {
    const exercicio = req.query.exercicio ? Number(req.query.exercicio) : undefined;
    const limite = req.query.limite ? Number(req.query.limite) : undefined;
    return res.json(getFilaPagamentos({ exercicio, limite }));
  });

  app.get('/api/transparencia/receitas', (_req, res) => {
    return res.json(getReceitasPorAno());
  });

  app.get('/api/transparencia/receitas/:exercicio', (req, res) => {
    const exercicio = Number(req.params.exercicio);
    if (!exercicio) { return res.status(400).json({ error: 'exercicio inválido' }); }
    return res.json(getReceitasDetalheExercicio(exercicio));
  });

  // ── Inteligência financeira (B1-B4) ──────────────────────────────────────

  // GET /api/inteligencia — painel completo (último exercício com dados)
  app.get('/api/inteligencia', (req, res) => {
    const exercicio = req.query.exercicio ? Number(req.query.exercicio) : undefined;
    return res.json(getPainelInteligencia(exercicio));
  });

  // GET /api/inteligencia/concentracao?exercicio=2025 — B1 concentração
  app.get('/api/inteligencia/concentracao', (req, res) => {
    const exercicio = req.query.exercicio ? Number(req.query.exercicio) : undefined;
    if (exercicio) { return res.json(getConcentracaoCredores(exercicio)); }
    return res.json(getConcentracaoHistorico());
  });

  // GET /api/inteligencia/anomalias?exercicio=2025 — B2 anomalias
  app.get('/api/inteligencia/anomalias', (req, res) => {
    const exercicio = Number(req.query.exercicio || 2025);
    return res.json(getEmpenhoAtipicos(exercicio));
  });

  // GET /api/inteligencia/evolucao — B3 evolução por funcao
  app.get('/api/inteligencia/evolucao', (_req, res) => {
    return res.json(getEvolucaoFuncoes());
  });

  // GET /api/inteligencia/ranking?exercicio=2025 — B4 ranking por funcao
  app.get('/api/inteligencia/ranking', (req, res) => {
    const exercicio = Number(req.query.exercicio || 2025);
    const topN = req.query.topN ? Number(req.query.topN) : 5;
    return res.json(getRankingPorFuncao(exercicio, topN));
  });

  // ── Narrativa IA para anomalias ───────────────────────────────────────────

  // POST /api/inteligencia/anomalias/narrativa?exercicio=2025
  app.post('/api/inteligencia/anomalias/narrativa', async (req, res) => {
    const exercicio = Number(req.query.exercicio || 2025);
    try {
      const anomalias = getEmpenhoAtipicos(exercicio);
      const { narrativa, cached } = await gerarNarrativaAnomalias(anomalias);
      return res.json({ exercicio, narrativa, cached });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── Alertas de inteligência ──────────────────────────────────────────────

  // GET /api/alertas — lista paginada (filtros: tipo, categoria, severidade, status, periodo)
  app.get('/api/alertas', (req, res) => {
    const { tipo, categoria, severidade, periodoInicio, periodoFim, pagina, limite } = req.query;
    return res.json(alertasRepo.listarAlertasPublicos({
      tipo: tipo || undefined,
      categoria: categoria || undefined,
      severidade: severidade || undefined,
      periodoInicio: periodoInicio || undefined,
      periodoFim: periodoFim || undefined,
      pagina: pagina ? Number(pagina) : 1,
      limite: limite ? Number(limite) : 20,
    }));
  });

  // GET /api/alertas/destaques — top N para home (ativos, mais recentes)
  app.get('/api/alertas/destaques', (req, res) => {
    const limite = req.query.limite ? Number(req.query.limite) : 5;
    return res.json(alertasRepo.listarDestaquesPublicos(limite));
  });

  // GET /api/alertas/stats — contagem por severidade
  app.get('/api/alertas/stats', (req, res) => {
    return res.json(alertasRepo.contarPorSeveridade('ativo', 'publicado'));
  });

  // GET /api/alertas/config — ler configurações
  app.get('/api/alertas/config', (_req, res) => {
    return res.json(alertasRepo.getAllConfig());
  });

  // PATCH /api/alertas/config — atualizar thresholds (admin)
  app.patch('/api/alertas/config', (req, res) => {
    const { chave, valor, descricao } = req.body || {};
    if (!chave || valor === undefined) {
      return res.status(400).json({ error: 'chave e valor são obrigatórios' });
    }
    try {
      alertasRepo.setConfig(chave, valor, descricao || null);
      return res.json({ ok: true, chave, valor });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /api/alertas/gerar — dispara geração manual (admin)
  app.post('/api/alertas/gerar', async (req, res) => {
    const { since, dryRun, limite, full, extrairFatos } = req.body || {};
    const ehFull = Boolean(full);
    try {
      const fatos = ehFull && extrairFatos !== false
        ? extrairFatosInteligencia({ limite: limite ? Number(limite) : 5000, apply: !dryRun })
        : null;
      const resultado = await generateAlerts({
        since: since || undefined,
        dryRun: Boolean(dryRun),
        full: ehFull,
        // Rebuild completo precisa varrer todo o acervo, não só uma página.
        limite: limite ? Number(limite) : ehFull ? 5000 : 200,
      });
      return res.json({ ...resultado, fatos });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // GET /api/alertas/:id — detalhe com documentos vinculados
  app.get('/api/admin/alertas', (req, res) => {
    const { tipo, categoria, severidade, status, estadoEditorial, periodoInicio, periodoFim, pagina, limite } = req.query;
    return res.json(alertasRepo.listarAlertas({
      tipo: tipo || undefined,
      categoria: categoria || undefined,
      severidade: severidade || undefined,
      status: status || undefined,
      estadoEditorial: estadoEditorial || undefined,
      periodoInicio: periodoInicio || undefined,
      periodoFim: periodoFim || undefined,
      pagina: pagina ? Number(pagina) : 1,
      limite: limite ? Number(limite) : 20,
    }));
  });

  app.get('/api/admin/alertas/stats', (_req, res) => {
    return res.json({
      severidade: alertasRepo.contarPorSeveridade('ativo'),
      editorial: alertasRepo.contarPorEstadoEditorial('ativo'),
    });
  });

  app.get('/api/admin/alertas/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'id invalido' });
    }
    const alerta = alertasRepo.getAlerta(id);
    if (!alerta) {
      return res.status(404).json({ error: 'Alerta nao encontrado' });
    }
    return res.json({
      ...alerta,
      historico_editorial: alertasRepo.listarHistoricoEditorial(id),
    });
  });

  app.patch('/api/admin/alertas/:id/editorial', (req, res) => {
    const id = Number(req.params.id);
    const { estado, motivos } = req.body || {};
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'id invalido' });
    }
    try {
      const ok = alertasRepo.setEstadoEditorial(id, estado, {
        origem: 'admin',
        motivos: Array.isArray(motivos) ? motivos : [],
      });
      if (!ok) {
        return res.status(404).json({ error: 'Alerta nao encontrado' });
      }
      return res.json({ ok: true, id, estado });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/admin/alertas/:id/reprocessar', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'id invalido' });
    }
    try {
      const resultado = await reprocessarInvestigacoesPendentes({
        id,
        force: true,
        delayMs: 0,
        dryRun: Boolean(req.body?.dryRun),
      });
      if (resultado.total_selecionados === 0) {
        return res.status(404).json({ error: 'Descoberta investigativa nao encontrada' });
      }
      return res.json(resultado);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/alertas/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'id inválido' });
    }
    const alerta = alertasRepo.getAlertaPublico(id);
    if (!alerta) {
      return res.status(404).json({ error: 'Alerta não encontrado' });
    }
    return res.json(alerta);
  });

  // PATCH /api/alertas/:id — alterar status (arquivar/suprimir/reativar)
  app.patch('/api/alertas/:id', (req, res) => {
    const id = Number(req.params.id);
    const { status } = req.body || {};
    if (!['ativo', 'arquivado', 'suprimido'].includes(status)) {
      return res.status(400).json({ error: 'status deve ser ativo, arquivado ou suprimido' });
    }
    const ok = alertasRepo.setAlertaStatus(id, status);
    if (!ok) {
      return res.status(404).json({ error: 'Alerta não encontrado' });
    }
    return res.json({ ok: true, id, status });
  });

  // ── Credores ─────────────────────────────────────────────────────────────

  // GET /api/credores — lista de credores
  app.get('/api/credores', (req, res) => {
    const { limite, pagina, busca, exercicio, mandato, finalidade } = req.query;
    const exercicios = !exercicio && mandato ? resolverExercicios({ mandato: Number(mandato) }) : undefined;
    if (finalidade && !FINALIDADES[finalidade]) { return res.status(400).json({ error: 'Finalidade desconhecida' }); }
    return res.json(listCredores({
      limite: limite ? Number(limite) : 50,
      pagina: pagina ? Number(pagina) : 1,
      busca: busca || undefined,
      exercicio: exercicio ? Number(exercicio) : undefined,
      exercicios,
      finalidade: finalidade || undefined,
    }));
  });

  // GET /api/credores/:cnpj — perfil completo de um credor (aceita CNPJ
  // formatado ou chave 'pf-…' de pessoa física)
  app.get('/api/credores/:cnpj', (req, res) => {
    const parsed = parseCredorChave(req.params.cnpj);
    if (!parsed) { return res.status(400).json({ error: 'Identificador de credor inválido' }); }
    const dossie = getCredorDossie(parsed.chave);
    if (!dossie) { return res.status(404).json({ error: 'Credor não encontrado' }); }
    return res.json(dossie);
  });

  // ── Busca FTS ─────────────────────────────────────────────────────────────

  // GET /api/busca/unificada?q= — documentos + empenhos + credores num só payload
  app.get('/api/busca/unificada', (req, res) => {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) {
      return res.status(400).json({ error: 'Parâmetro q obrigatório (mínimo 2 caracteres)' });
    }
    return res.json(buscaUnificada(q));
  });

  // GET /api/busca?q=texto&tipo=edital&ano=2025
  app.get('/api/busca', (req, res) => {
    const { q, tipo, fonte, ano, limite, pagina } = req.query;
    if (!q || String(q).trim().length < 2) {
      return res.status(400).json({ error: 'Parâmetro q obrigatório (mínimo 2 caracteres)' });
    }
    return res.json(searchDocumentos(q, {
      tipo: tipo || undefined,
      fonte: fonte || undefined,
      ano: ano ? Number(ano) : undefined,
      limite: limite ? Number(limite) : 20,
      pagina: pagina ? Number(pagina) : 1,
    }));
  });

  // ── Extração de entidades ─────────────────────────────────────────────────

  // POST /api/ia/extrair-entidades — run entity extraction from AI summaries
  app.post('/api/ia/extrair-entidades', (_req, res) => {
    try {
      const stats = extractEntitiesFromResumes();
      return res.json({ ok: true, ...stats });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // GET /api/scheduler/daily — status do scheduler diário
  app.get('/api/scheduler/daily', (_req, res) => {
    return res.json(dailyScheduler.getStatus());
  });

  // ── Emendas Parlamentares ──────────────────────────────────────────────────

  app.get('/api/emendas', (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limite || 20), 1), 100);
    const offset = Math.max(Number(req.query.offset || 0), 0);
    const filtros = {
      esfera: req.query.esfera || undefined,
      partido: req.query.partido || undefined,
      nome_parlamentar: req.query.parlamentar || undefined,
      ano: req.query.ano || undefined,
    };
    const emendas = listarEmendas({ ...filtros, limit, offset });
    const total = contarEmendas(filtros);
    res.json({ emendas, total, limit, offset });
  });

  app.get('/api/emendas/totais-por-ano', (_req, res) => {
    res.json(totaisPorAno());
  });

  app.get('/api/emendas/parlamentares', (req, res) => {
    res.json(parlamentaresComTotais({
      esfera: req.query.esfera || undefined,
      ano: req.query.ano || undefined,
    }));
  });

  app.get('/api/emendas/:id', (req, res) => {
    const emenda = getEmendaById(Number(req.params.id));
    if (!emenda) { return res.status(404).json({ error: 'Emenda nao encontrada' }); }
    return res.json(emenda);
  });

  // ─────────────────────────────────────────────────────────────────────────

  app.get('/api/documentos/:id/anexos', (req, res) => {
    const documentoId = Number(req.params.id);
    if (!Number.isInteger(documentoId)) {
      return res.status(400).json({ error: 'id inválido' });
    }
    const documento = getDocumentoById(documentoId);
    if (!documento) {
      return res.status(404).json({ error: 'Documento nao encontrado' });
    }
    return res.json({
      documento_pai: {
        id: documento.id,
        titulo: documento.titulo,
        tipo: documento.tipo,
        ano: documento.ano,
        data_publicacao: documento.data_publicacao,
        url_origem: documento.url_origem,
      },
      anexos: listarAnexosDocumento(documentoId),
      fatos: listarFatosDocumento(documentoId),
    });
  });

  app.get('/api/anexos/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'id inválido' });
    }
    const anexo = getAnexoById(id);
    if (!anexo) {
      return res.status(404).json({ error: 'Anexo nao encontrado' });
    }
    const isAdminPayload = String(req.query.admin || '').toLowerCase() === '1';
    if (isAdminPayload) {
      return res.json({
        ...anexo,
        fatos: listarFatosAnexo(id),
        aviso_analise: 'Resumo e fatos do anexo são análise automática a partir do texto extraído.',
      });
    }

    return res.json(anexoPublico(anexo));
  });

  // POST /api/anexos/:id/resumir — enfileira regeneração de resumo via IA
  // (assíncrono; não bloqueia a resposta — mesmo padrão de /documentos/:id/resumir).
  app.post('/api/anexos/:id/resumir', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'id inválido' });
    }
    try {
      recoverStaleAnexoResumoJobs({ staleMinutes: 5 });
      const force = req.body?.force === true || String(req.query.force || '').toLowerCase() === 'true';
      const anexo = getAnexoById(id);
      if (!anexo) {
        return res.status(404).json({ error: 'Anexo nao encontrado' });
      }
      if (!anexo.texto_completo) {
        return res.status(400).json({ error: `Anexo ${id} nao possui texto extraído para resumir` });
      }

      const textoHash = buildTextoHash(anexo.texto_completo);
      if (anexo.resumo_ai?.contrato_versao === CONTRATO_ANEXO_IA && anexo.resumo_ai?.texto_hash === textoHash && !force) {
        return res.json({ status: 'ok', resumo_ai: anexo.resumo_ai, mensagem: 'Resumo ja atualizado.' });
      }

      const provider = createAiProvider();
      const job = createAnexoResumoJob({
        anexo_id: id,
        provider: provider.provider,
        modelo: provider.model,
        contrato_versao: CONTRATO_ANEXO_IA,
        texto_hash: textoHash,
        force,
      });

      scheduleAnexoResumoJobWorker();

      return res.status(202).json({
        status: job.status,
        job,
        mensagem: 'Resumo de anexo enfileirado para processamento assincrono.',
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/anexos/resumos/jobs/:id', (req, res) => {
    const job = getAnexoResumoJobById(Number(req.params.id));
    if (!job) {
      return res.status(404).json({ error: 'Job de resumo de anexo nao encontrado' });
    }
    return res.json({ job });
  });

  // POST /api/documentos/:id/estruturar-itens — enfileira reextração dos itens
  // do processo via IA (assíncrono, mesmo padrão de /anexos/:id/resumir).
  // Protegido por default: POST classifica como adminWrite no security.js.
  app.post('/api/documentos/:id/estruturar-itens', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'id inválido' });
    }
    try {
      recoverStaleItensEstruturacaoJobs({ staleMinutes: 5 });
      const force = req.body?.force === true || String(req.query.force || '').toLowerCase() === 'true';
      const resultado = await enfileirarItensPendentes({ documentoId: id, force });

      if (!resultado.selecionados.length) {
        return res.status(404).json({ error: 'Documento nao encontrado ou sem texto para estruturar' });
      }
      if (!resultado.enfileirados.length) {
        return res.json({ status: 'ok', mensagem: 'Itens ja estruturados para o texto atual (use force para reprocessar).' });
      }

      scheduleItensProcessoJobWorker();
      return res.status(202).json({
        status: 'pendente',
        job_id: resultado.enfileirados[0].job_id,
        mensagem: 'Estruturacao de itens enfileirada para processamento assincrono.',
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/documentos/:id', (req, res) => {
    recoverStaleResumoAiJobs({ staleMinutes: 5 });
    const documento = getDocumentoById(Number(req.params.id));
    if (!documento) {
      return res.status(404).json({ error: 'Documento nao encontrado' });
    }

    const isAdminPayload = String(req.query.admin || '').toLowerCase() === '1';
    if (isAdminPayload) {
      return res.json({
        ...documento,
        resumo_ai_operacao: buildAiOperationPlan(documento)
      });
    }

    return res.json(documentoPublico(documento));
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

  app.post('/api/documentos/:id/correlacionar', async (req, res) => {
    try {
      const force = req.body?.force === true || String(req.query.force || '').toLowerCase() === 'true';
      const result = await correlateLicitation(Number(req.params.id), { force });
      return res.json({
        ...result,
        forcar_regeneracao: force
      });
    } catch (error) {
      const statusCode = /nao encontrado|nao e uma licitacao|AI_SUMMARY_ENABLED=false/i.test(error.message)
        ? 400
        : 500;
      logger.error('Falha no endpoint de leitura integrada IA', {
        documentoId: req.params.id,
        erro: error.message
      });
      return res.status(statusCode).json({ error: error.message });
    }
  });

  app.get('/api/ia/resumos/jobs/:id', (req, res) => {
    const job = getResumoAiJobById(Number(req.params.id));
    if (!job) {
      return res.status(404).json({ error: 'Job de resumo nao encontrado' });
    }

    return res.json({ job });
  });

  app.get('/api/ia/itens-estruturacao/jobs/:id', (req, res) => {
    const job = getItensEstruturacaoJobById(Number(req.params.id));
    if (!job) {
      return res.status(404).json({ error: 'Job de estruturacao de itens nao encontrado' });
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

  app.get('/api/cobertura/prefeitura', async (req, res, _next) => {
    const limite = Math.min(Math.max(Number(req.query.limite || 500), 1), 2000);

    try {
      const data = await compararCoberturaPrefeitura({ limite });
      res.json({
        ...data,
        origem: 'site_prefeitura',
        consultado_em: new Date().toISOString(),
        limite
      });
    } catch (error) {
      logger.warn('Cobertura da Prefeitura indisponivel', {
        limite,
        erro: error.message,
        causa: error.code || error.name
      });

      res.json({
        status: 'indisponivel',
        origem: 'site_prefeitura',
        consultado_em: new Date().toISOString(),
        fontes_consultadas: getCoberturaPrefeituraSourceLinks(),
        areas: getPrefeituraAreas().map((area) => ({
          id: area.id,
          titulo: area.titulo,
          tipo: area.tipo,
          page_id: area.pageId,
          public_url: area.publicUrl,
          technical_url: area.technicalUrl,
          status: 'indisponivel',
          erro: error.message || 'Falha ao consultar area',
          encontrados_site: 0,
          presentes_sistema: 0,
          ausentes_sistema: 0,
          documentos_conhecidos_area: 0
        })),
        erros: getPrefeituraAreas().map((area) => ({
          area_id: area.id,
          titulo: area.titulo,
          public_url: area.publicUrl,
          technical_url: area.technicalUrl,
          erro: error.message || 'Falha ao consultar area'
        })),
        limite,
        erro: 'Nao foi possivel consultar o site da Prefeitura agora.',
        total_site: 0,
        total_presentes_sistema: 0,
        total_ausentes_sistema: 0,
        por_ano: [],
        ausentes: [],
        dados: []
      });
    }
  });

  app.get('/api/inteligencia/panorama', (_req, res) => {
    res.json(getInteligenciaPanorama());
  });

  app.get('/api/inteligencia/cobertura', (_req, res) => {
    res.json({ dados: getCoberturaPorAno() });
  });

  app.get('/api/inteligencia/auditoria', (req, res) => {
    res.json(
      getAuditoria({
        ano: req.query.ano || undefined,
        tipo: req.query.tipo || undefined,
        fonte: req.query.fonte || undefined
      })
    );
  });

  app.get('/api/inteligencia/categorias', (_req, res) => {
    res.json(getCategoriasStats());
  });

  app.get('/api/inteligencia/categorias/documentos', (req, res) => {
    const pagina = Math.max(Number(req.query.pagina || 1), 1);
    const limite = Math.min(Math.max(Number(req.query.limite || 20), 1), 100);
    res.json(
      listCategoriasDocumentos({
        categoria: req.query.categoria || undefined,
        limite,
        pagina
      })
    );
  });

  app.get('/api/inteligencia/fornecedores', (req, res) => {
    const limite = Math.min(Math.max(Number(req.query.limite || 20), 1), 100);
    const ordem = ['valor', 'vitorias'].includes(req.query.ordem) ? req.query.ordem : 'valor';
    res.json({
      dados: getFornecedoresRanking({ limite, ordem }),
      filtros: { limite, ordem }
    });
  });

  // Dossiê de fornecedor unificado vive em /api/credores/:cnpj (getCredorDossie),
  // que já agrega licitado + pago. O endpoint /inteligencia/fornecedores/:cnpj foi
  // removido por redundância (Fase 4).

  app.get('/api/coletas/log', (req, res) => {
    const limite = Math.min(Math.max(Number(req.query.limite || 10), 1), 50);
    res.json({ dados: listColetasLog(limite) });
  });

  app.get('/api/coletas/atualizacao/status', (_req, res) => {
    res.json(getCollectionUpdateStatus());
  });

  app.post('/api/coletas/sincronizar-prefeitura', async (_req, res) => {
    try {
      res.json(await checkPrefeituraSyncOnPortalOpen());
    } catch (error) {
      logger.warn('Falha ao verificar sincronizacao automatica da Prefeitura', {
        erro: error.message,
        stack: error.stack
      });
      res.json({
        status: 'indisponivel',
        checked_at: new Date().toISOString(),
        erro: 'Nao foi possivel verificar a ultima atualizacao da Prefeitura agora.',
        coleta: {
          started: false,
          motivo: 'verificacao_indisponivel'
        },
        areas: [],
        erros: []
      });
    }
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

  // ── Admin observabilidade ─────────────────────────────────────────────────

  // GET /api/admin/status — snapshot completo de saúde do sistema
  app.get('/api/admin/status', (_req, res) => {
    const snapshot = getAdminSnapshot();
    return res.json({
      ...snapshot,
      schedulers: {
        coleta: collectionScheduler.getStatus(),
        ia: aiScheduler.getStatus(),
        diario: dailyScheduler.getStatus(),
        alertas: getAlertasStatus(),
        descobertas: descobertasScheduler.getStatus(),
      },
      timestamp: new Date().toISOString(),
    });
  });

  // GET /api/admin/ferramentas — catálogo de ferramentas + tarefas em andamento
  app.get('/api/admin/ferramentas', (_req, res) => {
    return res.json({
      ferramentas: listarFerramentas(),
      tarefas: lerStatusProgresso(),
      timestamp: new Date().toISOString(),
    });
  });

  // POST /api/admin/trigger/:acao — dispara ação manual
  app.post('/api/admin/trigger/:acao', async (req, res) => {
    const { acao } = req.params;

    // Ferramentas de manutenção (catálogo em admin-tarefas.js)
    if (listarFerramentas().some((f) => f.id === acao)) {
      const resultado = await executarFerramenta(acao);
      const status = resultado.ok ? 200 : resultado.jaRodando ? 409 : 400;
      return res.status(status).json({ ok: resultado.ok, acao, ...resultado });
    }

    if (acao === 'ai-cycle') {
      // Dispara ciclo IA em background — não bloqueia resposta
      aiScheduler.runCycle().catch((e) =>
        logger.warn('admin trigger ai-cycle: erro', { erro: e.message })
      );
      return res.json({ ok: true, acao, msg: 'Ciclo IA iniciado em background' });
    }

    if (acao === 'descobertas-ia-cycle') {
      descobertasScheduler.runInvestigationCycle({ force: true }).catch((e) =>
        logger.warn('admin trigger descobertas-ia-cycle: erro', { erro: e.message })
      );
      return res.json({ ok: true, acao, msg: 'Ciclo incremental de descobertas IA iniciado em background' });
    }

    if (acao === 'extract-entities') {
      const resultado = extractEntitiesFromResumes();
      return res.json({ ok: true, acao, resultado });
    }

    if (acao === 'rebuild-fts') {
      const n = rebuildFtsIndex();
      return res.json({ ok: true, acao, rows_indexed: n });
    }

    if (acao === 'daily-transparencia') {
      // Forçar coleta de transparência ignorando intervalo
      const ColetorPortalTransparencia = require('../coletores/portal-transparencia');
      const coletor = new ColetorPortalTransparencia();
      const resultado = { novos: 0, atualizados: 0, erros: 0 };
      coletor.executar(resultado).catch((e) =>
        logger.warn('admin trigger daily-transparencia: erro', { erro: e.message })
      );
      return res.json({ ok: true, acao, msg: 'Coleta de transparência iniciada em background' });
    }

    return res.status(400).json({ error: `Ação desconhecida: ${acao}` });
  });

  // ── Revisão de produtos extraídos (curadoria de qualidade) ────────────────

  // GET /api/admin/produtos-revisao/resumo — contagens por status e confiança
  app.get('/api/admin/produtos-revisao/resumo', (_req, res) => {
    res.json(contarProdutosRevisao());
  });

  // GET /api/admin/produtos-revisao — fila de pendentes (menos confiáveis primeiro)
  app.get('/api/admin/produtos-revisao', (req, res) => {
    res.json(
      listProdutosParaRevisao({
        confiancaMax: req.query.confiancaMax !== undefined ? Number(req.query.confiancaMax) : undefined,
        documentoId: req.query.documentoId || undefined,
        limite: req.query.limite || undefined,
        pagina: req.query.pagina || undefined,
      })
    );
  });

  // PATCH /api/admin/produtos-revisao/:id — validar/rejeitar um produto
  app.patch('/api/admin/produtos-revisao/:id', (req, res) => {
    const { status } = req.body || {};
    try {
      const atualizado = setProdutoStatusRevisao(req.params.id, status);
      if (!atualizado) {
        return res.status(404).json({ error: 'Produto não encontrado' });
      }
      return res.json(atualizado);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  });

  // POST /api/admin/produtos-revisao/validar-lote — validar em lote por confiança
  app.post('/api/admin/produtos-revisao/validar-lote', (req, res) => {
    const { documentoId, confiancaMin } = req.body || {};
    const validados = validarLoteProdutos({
      documentoId: documentoId || undefined,
      confiancaMin: confiancaMin !== undefined ? Number(confiancaMin) : undefined,
    });
    res.json({ ok: true, validados });
  });

  // ─────────────────────────────────────────────────────────────────────────

  app.use((error, _req, res, _next) => {
    logger.error('Erro inespeed na API', { erro: error.message, stack: error.stack });
    res.status(500).json({ error: 'Erro interno do servidor' });
  });

  return app;
}

function listenOnPort(app, port) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, config.apiHost, () => {
      server.off('error', onError);
      logger.info('API iniciada', {
        host: config.apiHost,
        port
      });
      resolve(server);
    });

    function onError(error) {
      server.off('listening', onListening);
      server.close();
      reject(error);
    }

    function onListening() {
      server.off('error', onError);
    }

    server.once('error', onError);
    server.once('listening', onListening);
  });
}

async function startServer() {
  const app = createServer();
  const ports = config.apiPort === 3001 ? [3001, 3002] : [config.apiPort];

  for (const port of ports) {
    try {
      return await listenOnPort(app, port);
    } catch (error) {
      const hasFallback = port !== ports[ports.length - 1];
      if (error.code === 'EADDRINUSE' && hasFallback) {
        logger.warn('Porta da API ocupada, tentando proxima porta', {
          host: config.apiHost,
          port,
          proximaPorta: ports[ports.indexOf(port) + 1]
        });
        continue;
      }

      throw error;
    }
  }
}

module.exports = {
  createServer,
  startServer
};
