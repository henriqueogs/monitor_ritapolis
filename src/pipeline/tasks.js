'use strict';
const config = require('../config');
const { factsSignature } = require('./policy');

async function extract(payload, anexo = false, progress) {
  const api = require('../db');
  const target = anexo
    ? require('../db/inteligencia-fatos-repo').getAnexoById(payload.anexoId)
    : api.getDocumentoById(payload.documentoId);
  if (!target) {
    throw new Error('Fonte nao encontrada');
  }
  if (target.texto_completo?.trim()) {
    return { reused: true, chars: target.texto_completo.length };
  }
  const url = anexo ? target.url : target.url_pdf;
  if (!url) {
    throw new Error('Texto insuficiente: documento sem arquivo oficial');
  }
  const Base = require('../coletores/base');
  const downloader = new Base({ fonte: 'pipeline_extracao' });
  if (api.db) {
    downloader.filePolicy = require('./file-policy').createFilePolicy(api.db);
  }
  const buffer = await downloader.baixarBuffer(url);
  let extraction = await require('../parsers/document-file').extractOfficialFileText(buffer, {
    url,
    filename: target.nome,
  });
  // Official download endpoints often have no extension (e.g. ?Download=79714).
  // Inspect the file signature rather than trusting the URL or content type.
  const isPdf = buffer.subarray(0, 1024).includes(Buffer.from('%PDF-'));
  if (!extraction.text?.trim() && isPdf && !extraction.error) {
    const ocr = require('../parsers/ocr');
    let result;
    try {
      result = await ocr.ocrPdfBuffer(buffer, {
        maxPaginas: extraction.pages || 12,
        ...(progress ? { progress } : {}),
      });
    } finally {
      await ocr.encerrarWorker();
    }
    extraction = { text: result.texto, pages: result.paginas, info: { parser: 'ocr' } };
  }
  if (!extraction.text?.trim()) {
    throw new Error('Texto insuficiente: extracao/OCR exige revisao');
  }
  if (anexo) {
    api.saveDocumentoAnexoTexto({
      id: target.id,
      texto: extraction.text,
      textoHash: require('../ai/summarize-document').buildTextoHash(extraction.text),
      status: 'ok',
      erro: null,
      parser: extraction.info?.parser || 'pipeline',
      paginas: extraction.pages,
    });
  } else {
    api.saveDocumento({
      ...target,
      texto_completo: extraction.text,
      status_coleta: 'ok',
      dados_extras: {
        ...(target.dados_extras || {}),
        texto_origem: extraction.info?.parser === 'ocr' ? 'ocr' : 'arquivo_oficial',
        parser_pdf: {
          ...(target.dados_extras?.parser_pdf || {}),
          paginas: extraction.pages,
          engine: extraction.info?.parser || 'pipeline',
          erro: null,
        },
      },
    });
  }
  return {
    chars: extraction.text.length,
    pages: extraction.pages,
    source_url: url,
    file_hash: require('crypto').createHash('sha256').update(buffer).digest('hex'),
    text_hash: require('../ai/summarize-document').buildTextoHash(extraction.text),
  };
}
async function execute(job, { progress } = {}) {
  const payload = JSON.parse(job.payload);
  const api = require('../db');
  if (job.kind === 'alerts') {
    return require('../alertas/alert-generator').generateAlerts(payload);
  }
  if (job.kind === 'investigation') {
    return require('../inteligencia/discovery-investigation-runner').reprocessarInvestigacoesPendentes(
      { ...payload, force: true, delayMs: 0 }
    );
  }
  if (job.kind === 'anomaly-narrative') {
    const input = require('../db/inteligencia-repo').getEmpenhoAtipicos(payload.exercicio);
    return require('../ai/anomaly-narrative').gerarNarrativaAnomalias(input);
  }
  if (job.kind === 'backup') {
    return require('../storage/daily-snapshot').createDailySnapshot({ dbPath: config.dbPath });
  }
  if (job.kind === 'financial-plan') {
    require('./planner').planFinance(require('./coordinator').getQueue());
    return { planned: true };
  }
  if (job.kind === 'expenses') {
    const collector = new (require('../coletores/portal-transparencia'))();
    collector.progress = progress;
    const stats = await collector.coletarDespesasJanela(payload.ano, payload.ini, payload.fim);
    if (stats.novos || stats.atualizados) {
      const repo = require('../db/transparencia-repo');
      repo.crosswalkDespesasDocumentos();
      repo.enriquecerDetalhesComEmpenhos();
    }
    return stats;
  }
  if (job.kind === 'revenue') {
    const collector = new (require('../coletores/portal-transparencia'))();
    collector.progress = progress;
    return collector.coletarReceitas(payload.ano);
  }
  if (job.kind === 'collection') {
    const { buildCollectors } = require('../coletas/update-runner');
    const collector = buildCollectors(payload.fonte)[0];
    collector.progress = progress;
    collector.filePolicy = require('./file-policy').createFilePolicy(api.db);
    const result = await collector.run();
    if (result.status === 'erro_total' || result.status === 'erro_parcial') {
      throw new Error(
        result.detalhes
          .filter(d => d.erro)
          .map(d => d.erro)
          .join('; ') || 'Coleta parcial requer revisao'
      );
    }
    return result;
  }
  if (job.kind === 'source-check') {
    const doc = api.db.prepare('SELECT * FROM documentos WHERE id = ?').get(payload.documentoId);
    if (!doc?.url_pdf) {
      return { skipped: true };
    }
    // A completed extraction already read the entire original. Reuse that
    // evidence only for the same URL and current text, not a timestamp alone.
    const verified = api.db
      .prepare(
        `SELECT result FROM pipeline_jobs
      WHERE kind='extract' AND entity=? AND status='ok'
        AND finished_at>=? AND json_extract(result,'$.source_url')=?
      ORDER BY finished_at DESC LIMIT 1`
      )
      .get(String(doc.id), new Date(Date.now() - 30 * 86400000).toISOString(), doc.url_pdf);
    const evidence = verified ? JSON.parse(verified.result) : null;
    if (
      evidence?.file_hash &&
      evidence.text_hash === require('../ai/summarize-document').buildTextoHash(doc.texto_completo)
    ) {
      return { unchanged: true, reusedExtraction: true };
    }
    api.db.exec(
      'CREATE TABLE IF NOT EXISTS pipeline_http_cache (url TEXT PRIMARY KEY, etag TEXT, modified TEXT)'
    );
    const cached = api.db
      .prepare('SELECT * FROM pipeline_http_cache WHERE url = ?')
      .get(doc.url_pdf);
    const headers = {};
    if (cached?.etag) {
      headers['If-None-Match'] = cached.etag;
    }
    if (cached?.modified) {
      headers['If-Modified-Since'] = cached.modified;
    }
    const Base = require('../coletores/base');
    const response = await new Base({ fonte: 'verificacao_mensal' }).buscarComRetry(doc.url_pdf, {
      responseType: 'arraybuffer',
      headers,
    });
    if (response.status === 304) {
      return { unchanged: true, conditional: true };
    }
    const buffer = Buffer.from(response.data);
    const signature = require('crypto').createHash('sha256').update(buffer).digest('hex');
    if (signature !== doc.hash_conteudo) {
      const extracted = await require('../parsers/document-file').extractOfficialFileText(buffer, {
        url: doc.url_pdf,
      });
      if (!extracted.text?.trim()) {
        throw new Error('Fonte mudou mas requer OCR/revisao; texto antigo preservado');
      }
      // File revision is authoritative. Do not let OCR non-regression hide a
      // genuinely replaced original; retain old summaries as stale history.
      api.db
        .prepare(
          'UPDATE documentos SET texto_completo = ?, hash_conteudo = ?, atualizado_em = ? WHERE id = ?'
        )
        .run(extracted.text, signature, new Date().toISOString(), doc.id);
    }
    api.db
      .prepare(
        `INSERT INTO pipeline_http_cache VALUES (?, ?, ?)
      ON CONFLICT(url) DO UPDATE SET etag = excluded.etag, modified = excluded.modified
      WHERE etag IS NOT excluded.etag OR modified IS NOT excluded.modified`
      )
      .run(doc.url_pdf, response.headers.etag || null, response.headers['last-modified'] || null);
    return { unchanged: signature === doc.hash_conteudo };
  }
  if (job.kind === 'extract' || job.kind === 'extract-anexo') {
    return extract(payload, job.kind === 'extract-anexo', progress);
  }
  if (job.kind === 'summary') {
    return require('../ai/summarize-document').summarizeDocument(payload.documentoId, {
      force: payload.force === true,
      progress,
    });
  }
  if (job.kind === 'integrated') {
    // Refuse to publish an analysis of stale dependencies. Replanning queues
    // a new identity when the authoritative input changed in the meantime.
    if (
      api.buildLicitacaoLeituraIntegradaPayload(payload.documentoId).texto_hash !== job.input_hash
    ) {
      return { skipped: true, reason: 'input_changed' };
    }
    return require('../ai/correlate-licitation').correlateLicitation(payload.documentoId, {
      force: payload.force === true,
    });
  }
  if (job.kind === 'items') {
    const items = require('../ai/estruturar-itens-processo');
    const document = api.getDocumentoById(payload.documentoId);
    if (!document || items.computeInputHash(document, items.listarAtasDoDocumento(document.id)) !== job.input_hash ||
        job.version !== items.CONTRACT_VERSION) {
      return { skipped: true, reason: 'input_changed' };
    }
    return items.estruturarItensProcesso(document, { progress });
  }
  if (job.kind === 'anexo-summary') {
    const target = require('../db/inteligencia-fatos-repo').getAnexoById(payload.anexoId);
    if (
      !target ||
      require('../ai/summarize-document').buildTextoHash(target.texto_completo) !==
        job.input_hash ||
      require('../ai/summarize-anexo').getAnexoSummaryVersion(target.texto_completo) !== job.version
    ) {
      return { skipped: true, reason: 'input_changed' };
    }
    const result = await require('../ai/summarize-anexo').summarizeAnexo(target, {
      documento: api.getDocumentoById(payload.documentoId),
      progress,
    });
    if (result.erro) {
      throw new Error(result.erro);
    }
    return result;
  }
  if (job.kind === 'facts') {
    const result = require('../inteligencia/fatos-runner').extrairFatosInteligencia({
      documentoIds: [payload.documentoId],
      apply: true,
    });
    const queue = require('./coordinator').getQueue();
    queue.enqueue({
      kind: 'analysis',
      entity: 'general',
      hash: factsSignature(queue.db, job),
      priority: 45,
    });
    return result;
  }
  if (job.kind === 'analysis') {
    const queue = require('./coordinator').getQueue();
    const current = factsSignature(queue.db);
    if (
      !job.input_hash.startsWith('manual:') &&
      (current !== job.input_hash || queue.meta('analysis_input') === current)
    ) {
      return { skipped: true, reason: 'superseded_or_unchanged' };
    }
    const alerts = await require('../alertas/alert-generator').generateAlerts({
      limite: config.alertasLimitePorCiclo,
    });
    const result =
      await require('../inteligencia/discovery-investigation-runner').reprocessarInvestigacoesPendentes(
        { limite: 1 }
      );
    if (alerts.erros || result.total_erro) {
      throw new Error('Analise geral falhou parcialmente; requer revisao');
    }
    queue.setMeta('analysis_input', current);
    return { alerts, result };
  }
  if (job.kind.startsWith('legacy-')) {
    const types = {
      'legacy-summary': ['documentos_resumos_ai_jobs', '../ai/summary-job-worker'],
      'legacy-anexo': ['documentos_anexos_resumos_ai_jobs', '../ai/anexo-summary-job-worker'],
      'legacy-items': ['documentos_itens_estruturacao_ai_jobs', '../ai/itens-processo-job-worker'],
    };
    const [table, modulePath] = types[job.kind] || [];
    if (!table) {
      throw new Error('Job legado invalido');
    }
    const old = api.db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(payload.legacyId);
    if (!old || old.status === 'ok') {
      return { reused: true };
    }
    api.db.prepare(`UPDATE ${table} SET status = 'pendente' WHERE id = ?`).run(old.id);
    await require(modulePath).processJob({ ...old, status: 'pendente' }, { progress });
    const finished = api.db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(old.id);
    if (finished.status !== 'ok') {
      throw new Error(finished.erro || 'Job legado nao concluido');
    }
    return { id: old.id, status: finished.status };
  }
  if (job.kind === 'maintenance') {
    const catalog = require('../api/admin-tarefas').FERRAMENTAS;
    const tool = catalog[payload.tool];
    if (!tool) {
      throw new Error('Ferramenta nao autorizada');
    }
    const { execFile } = require('child_process');
    return new Promise((resolve, reject) =>
      execFile(
        process.execPath,
        [require('path').resolve('scripts', tool.script), ...tool.args],
        { timeout: 9 * 60000, maxBuffer: 1024 * 1024, windowsHide: true },
        (error, stdout) => (error ? reject(error) : resolve({ output: stdout.slice(-4000) }))
      )
    );
  }
  throw new Error(`Tarefa nao suportada: ${job.kind}`);
}
module.exports = { execute };
