const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');
const config = require('../config');
const { classifyAiError, getAiOperationPlan } = require('../ai/operation-policy');
const { deepRepairStrings, normalizeText } = require('../utils/text');

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

const db = new DatabaseSync(config.dbPath);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

function parseJson(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function serializeJson(value) {
  return value == null ? null : JSON.stringify(value);
}

function likeParam(value) {
  return `%${String(value).trim()}%`;
}

function buildTextoHash(textoCompleto) {
  return crypto.createHash('sha256').update(String(textoCompleto || ''), 'utf8').digest('hex');
}

const fonteLabels = {
  site_prefeitura: 'Prefeitura',
  camara: 'C\u00e2mara'
};

const tipoLabels = {
  edital: 'Licita\u00e7\u00e3o/Edital',
  lei: 'Lei',
  portaria: 'Portaria',
  contrato: 'Contrato',
  decreto: 'Decreto',
  documento: 'Documento'
};

const statusLabels = {
  ok: 'Coletado com sucesso',
  erro_pdf: 'Arquivo com falha de leitura',
  sem_pdf: 'Sem arquivo oficial',
  erro_total: 'Falha na coleta',
  erro_parcial: 'Coleta parcial',
  em_andamento: 'Coleta em andamento',
  aberta: 'Aberta',
  homologada: 'Homologada',
  deserta: 'Deserta',
  suspensa: 'Suspensa',
  revisar: 'Revisar'
};

function labelFonte(value) {
  return fonteLabels[value] || value || 'Fonte nao informada';
}

function labelTipo(value) {
  return tipoLabels[value] || value || 'Documento';
}

function labelStatus(value) {
  return statusLabels[value] || value || 'Sem status';
}

function buildQualidadeAlertas(documento) {
  const alertas = [];

  if (!documento.url_pdf) {
    alertas.push({
      tipo: 'sem_pdf',
      label: 'Sem arquivo oficial vinculado',
      descricao: 'A fonte original esta disponivel, mas nao ha arquivo anexado neste registro.'
    });
  }

  if (documento.status_coleta === 'erro_pdf') {
    alertas.push({
      tipo: 'erro_pdf',
      label: 'Arquivo com falha de leitura',
      descricao: 'O documento foi localizado, mas o texto do arquivo oficial nao pode ser extraido corretamente.'
    });
  }

  if (!documento.data_publicacao && !documento.atualizado_em) {
    alertas.push({
      tipo: 'sem_data',
      label: 'Sem data identificada',
      descricao: 'Nao foi possivel identificar uma data de publicacao confiavel.'
    });
  }

  return alertas;
}

function buildDocumentoIndicadores(documento) {
  const temPdf = Boolean(documento.url_pdf);
  const temTextoExtraido = Boolean(documento.texto_completo || documento.texto_completo_chars > 0);
  const temResumoAi = Boolean(documento.tem_resumo_ai || documento.resumo_ai);
  const alertas = buildQualidadeAlertas(documento);

  return {
    tem_pdf: temPdf,
    tem_texto_extraido: temTextoExtraido,
    tem_resumo_ai: temResumoAi,
    tem_alertas_qualidade: alertas.length > 0,
    dados_incompletos: alertas.length > 0,
    total_alertas_qualidade: alertas.length
  };
}

function buildOrigemResumo(documento) {
  return {
    fonte: documento.fonte,
    fonte_nome: labelFonte(documento.fonte),
    tipo: documento.tipo,
    tipo_nome: labelTipo(documento.tipo),
    url_origem: documento.url_origem || null,
    url_pdf: documento.url_pdf || null,
    coletado_em: documento.coletado_em || null,
    atualizado_em: documento.atualizado_em || null
  };
}

function decorateDocumento(documento) {
  if (!documento) return null;
  const qualidadeAlertas = buildQualidadeAlertas(documento);

  return {
    ...documento,
    fonte_nome: labelFonte(documento.fonte),
    tipo_nome: labelTipo(documento.tipo),
    status_coleta_nome: labelStatus(documento.status_coleta),
    origem_resumo: buildOrigemResumo(documento),
    indicadores: buildDocumentoIndicadores(documento),
    qualidade_alertas: qualidadeAlertas
  };
}

function normalizeDocumento(row) {
  if (!row) return null;
  return decorateDocumento({
    ...Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        typeof value === 'string' ? normalizeText(value) : value
      ])
    ),
    dados_extras: deepRepairStrings(parseJson(row.dados_extras))
  });
}

function normalizeLicitacao(row) {
  if (!row) return null;
  const status = row.status || null;
  return {
    ...normalizeDocumento(row),
    licitacao_detalhes: {
      modalidade: row.modalidade || null,
      status,
      status_nome: labelStatus(status),
      vencedor_nome: row.vencedor_nome || null,
      vencedor_cnpj: row.vencedor_cnpj || null,
      valor_final: row.valor_final ?? null,
      numero_pncp: row.numero_pncp || null,
      data_homologacao: row.data_homologacao || null
    }
  };
}

function normalizeResumoAi(row) {
  if (!row) return null;

  return {
    ...Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        typeof value === 'string' ? normalizeText(value) : value
      ])
    ),
    resumo_json: deepRepairStrings(parseJson(row.resumo_json))
  };
}

function normalizeResumoAiJob(row) {
  if (!row) return null;
  const startedAt = row.iniciado_em ? new Date(row.iniciado_em).getTime() : null;
  const finishedAt = row.finalizado_em ? new Date(row.finalizado_em).getTime() : null;
  const durationMs = startedAt && finishedAt ? Math.max(finishedAt - startedAt, 0) : null;
  const operation = getAiOperationPlan({
    texto: row.texto_completo || '',
    caracteres: row.texto_chars
  });

  return {
    ...Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        typeof value === 'string' ? normalizeText(value) : value
      ])
    ),
    texto_completo: undefined,
    duracao_ms: durationMs,
    duracao_segundos: durationMs == null ? null : Math.round(durationMs / 1000),
    erro_categoria: classifyAiError(row.erro),
    operacao: operation,
    force: Boolean(row.force)
  };
}

function findDocumentoByIdentity(identity) {
  if (identity.urlPdf) {
    const byPdf = db
      .prepare('SELECT * FROM documentos WHERE url_pdf = ? LIMIT 1')
      .get(identity.urlPdf);
    if (byPdf) return byPdf;
  }

  if (identity.fonte === 'camara') {
    const candidates = db
      .prepare(
        `SELECT * FROM documentos
         WHERE fonte = @fonte
           AND url_origem = @urlOrigem
           AND IFNULL(numero, '') = IFNULL(@numero, '')
           AND IFNULL(ano, 0) = IFNULL(@ano, 0)
           AND tipo = @tipo
         LIMIT 1`
      )
      .get({
        fonte: identity.fonte,
        urlOrigem: identity.urlOrigem,
        numero: identity.numero || null,
        ano: identity.ano || null,
        tipo: identity.tipo
      });

    if (candidates) return candidates;
  }

  if (identity.hashConteudo && identity.fonte) {
    return (
      db
        .prepare(
          'SELECT * FROM documentos WHERE fonte = ? AND hash_conteudo = ? LIMIT 1'
        )
        .get(identity.fonte, identity.hashConteudo) || null
    );
  }

  return null;
}

function saveDocumento(documento) {
  const now = new Date().toISOString();
  const existing = findDocumentoByIdentity({
    fonte: documento.fonte,
    tipo: documento.tipo,
    numero: documento.numero,
    ano: documento.ano,
    urlOrigem: documento.url_origem,
    urlPdf: documento.url_pdf,
    hashConteudo: documento.hash_conteudo
  });

  const payload = {
    fonte: documento.fonte,
    tipo: documento.tipo,
    numero: documento.numero || null,
    ano: documento.ano || null,
    titulo: documento.titulo,
    resumo: documento.resumo || null,
    data_publicacao: documento.data_publicacao || null,
    data_abertura: documento.data_abertura || null,
    valor_estimado: documento.valor_estimado ?? null,
    url_origem: documento.url_origem,
    url_pdf: documento.url_pdf || null,
    texto_completo: documento.texto_completo || null,
    dados_extras: serializeJson(documento.dados_extras || null),
    hash_conteudo: documento.hash_conteudo || null,
    status_coleta: documento.status_coleta || 'ok'
  };

  let result;

  if (existing) {
    db.prepare(
      `UPDATE documentos SET
        fonte = @fonte,
        tipo = @tipo,
        numero = @numero,
        ano = @ano,
        titulo = @titulo,
        resumo = @resumo,
        data_publicacao = @data_publicacao,
        data_abertura = @data_abertura,
        valor_estimado = @valor_estimado,
        url_origem = @url_origem,
        url_pdf = @url_pdf,
        texto_completo = @texto_completo,
        dados_extras = @dados_extras,
        hash_conteudo = @hash_conteudo,
        status_coleta = @status_coleta,
        atualizado_em = @atualizadoEm
       WHERE id = @id`
    ).run({ ...payload, id: existing.id, atualizadoEm: now });
    result = { id: existing.id, action: 'updated' };
  } else {
    const insert = db.prepare(
      `INSERT INTO documentos (
        fonte, tipo, numero, ano, titulo, resumo, data_publicacao, data_abertura,
        valor_estimado, url_origem, url_pdf, texto_completo, dados_extras,
        hash_conteudo, status_coleta, coletado_em, atualizado_em
      ) VALUES (
        @fonte, @tipo, @numero, @ano, @titulo, @resumo, @data_publicacao, @data_abertura,
        @valor_estimado, @url_origem, @url_pdf, @texto_completo, @dados_extras,
        @hash_conteudo, @status_coleta, @coletadoEm, @atualizadoEm
      )`
    );
    const inserted = insert.run({ ...payload, coletadoEm: now, atualizadoEm: now });
    result = { id: inserted.lastInsertRowid, action: 'inserted' };
  }

  db.prepare(
    `INSERT INTO documentos_fontes (documento_id, fonte, url_origem, url_pdf, hash_conteudo, coletado_em)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(documento_id, fonte, url_origem, url_pdf)
     DO UPDATE SET hash_conteudo = excluded.hash_conteudo, coletado_em = excluded.coletado_em`
  ).run(
    result.id,
    documento.fonte,
    documento.url_origem,
    documento.url_pdf || '',
    documento.hash_conteudo || null,
    now
  );

  if (documento.licitacao_detalhes) {
    db.prepare(
      `INSERT INTO licitacoes_detalhes (
        documento_id, modalidade, status, vencedor_nome, vencedor_cnpj,
        valor_final, numero_pncp, data_homologacao
      ) VALUES (
        @documento_id, @modalidade, @status, @vencedor_nome, @vencedor_cnpj,
        @valor_final, @numero_pncp, @data_homologacao
      )
      ON CONFLICT(documento_id) DO UPDATE SET
        modalidade = excluded.modalidade,
        status = excluded.status,
        vencedor_nome = excluded.vencedor_nome,
        vencedor_cnpj = excluded.vencedor_cnpj,
        valor_final = excluded.valor_final,
        numero_pncp = excluded.numero_pncp,
        data_homologacao = excluded.data_homologacao`
    ).run({
      documento_id: result.id,
      modalidade: documento.licitacao_detalhes.modalidade || null,
      status: documento.licitacao_detalhes.status || null,
      vencedor_nome: documento.licitacao_detalhes.vencedor_nome || null,
      vencedor_cnpj: documento.licitacao_detalhes.vencedor_cnpj || null,
      valor_final: documento.licitacao_detalhes.valor_final ?? null,
      numero_pncp: documento.licitacao_detalhes.numero_pncp || null,
      data_homologacao: documento.licitacao_detalhes.data_homologacao || null
    });
  }

  return result;
}

function createColetaLog({ fonte, inicio }) {
  db.prepare(
    `UPDATE coletas_log
     SET status = 'erro_total',
         fim = COALESCE(fim, CURRENT_TIMESTAMP),
         detalhes = json_object('motivo', 'execucao_interrompida')
     WHERE fonte = ?
       AND status = 'em_andamento'`
  ).run(fonte);

  const result = db
    .prepare('INSERT INTO coletas_log (fonte, inicio, status, detalhes) VALUES (?, ?, ?, ?)')
    .run(fonte, inicio, 'em_andamento', null);
  return result.lastInsertRowid;
}

function finishColetaLog(id, data) {
  db.prepare(
    `UPDATE coletas_log SET
      fim = @fim,
      status = @status,
      itens_novos = @itens_novos,
      itens_atualizados = @itens_atualizados,
      itens_com_erro = @itens_com_erro,
      detalhes = @detalhes
    WHERE id = @id`
  ).run({
    id,
    fim: data.fim,
    status: data.status,
    itens_novos: data.itens_novos || 0,
    itens_atualizados: data.itens_atualizados || 0,
    itens_com_erro: data.itens_com_erro || 0,
    detalhes: serializeJson(data.detalhes || null)
  });
}

function buildDocumentoWhere({ fonte, tipo, ano, status, termo, qualidade }, params) {
  const filters = [];

  if (fonte) {
    filters.push('fonte = @fonte');
    params.fonte = fonte;
  }

  if (tipo) {
    filters.push('tipo = @tipo');
    params.tipo = tipo;
  }

  if (ano) {
    filters.push('ano = @ano');
    params.ano = Number(ano);
  }

  if (status) {
    filters.push('status_coleta = @status');
    params.status = status;
  }

  if (termo) {
    filters.push(
      '(titulo LIKE @termo OR resumo LIKE @termo OR IFNULL(numero, \'\') LIKE @termo OR IFNULL(texto_completo, \'\') LIKE @termo)'
    );
    params.termo = likeParam(termo);
  }

  if (qualidade === 'sem_pdf') {
    filters.push("IFNULL(url_pdf, '') = ''");
  }

  if (qualidade === 'erro_pdf') {
    filters.push("status_coleta = 'erro_pdf'");
  }

  if (qualidade === 'sem_data') {
    filters.push("IFNULL(data_publicacao, '') = ''");
  }

  return filters.length ? `WHERE ${filters.join(' AND ')}` : '';
}

function listDocumentos({ fonte, tipo, ano, status, termo, qualidade, pagina = 1, limite = 20 }) {
  const params = {};
  const whereClause = buildDocumentoWhere({ fonte, tipo, ano, status, termo, qualidade }, params);
  const total = db.prepare(`SELECT COUNT(*) as total FROM documentos ${whereClause}`).get(params).total;
  const offset = (pagina - 1) * limite;
  const rows = db
    .prepare(
      `SELECT d.id, d.fonte, d.tipo, d.numero, d.ano, d.titulo, d.resumo,
              d.data_publicacao, d.data_abertura, d.valor_estimado,
              d.url_origem, d.url_pdf, d.hash_conteudo, d.status_coleta,
              d.coletado_em, d.atualizado_em,
              LENGTH(IFNULL(d.texto_completo, '')) AS texto_completo_chars,
              EXISTS (
                SELECT 1
                FROM documentos_resumos_ai rai
                WHERE rai.documento_id = d.id
                  AND rai.status = 'ok'
              ) AS tem_resumo_ai
       FROM documentos d
       ${whereClause}
       ORDER BY COALESCE(data_publicacao, atualizado_em) DESC, COALESCE(ano, 0) DESC, id DESC
       LIMIT @limite OFFSET @offset`
    )
    .all({ ...params, limite, offset });

  return {
    total,
    pagina,
    limite,
    dados: rows.map(normalizeDocumento)
  };
}

function listAnosDocumentos({ fonte, tipo } = {}) {
  const filters = ['ano IS NOT NULL'];
  const params = {};

  if (fonte) {
    filters.push('fonte = @fonte');
    params.fonte = fonte;
  }

  if (tipo) {
    filters.push('tipo = @tipo');
    params.tipo = tipo;
  }

  return db
    .prepare(
      `SELECT ano, COUNT(*) AS total
       FROM documentos
       WHERE ${filters.join(' AND ')}
       GROUP BY ano
       ORDER BY ano DESC`
    )
    .all(params);
}

function listLicitacoes({ fonte, ano, status, termo, pagina = 1, limite = 20 }) {
  const filters = ['d.tipo = \'edital\''];
  const params = {};

  if (fonte) {
    filters.push('d.fonte = @fonte');
    params.fonte = fonte;
  }

  if (ano) {
    filters.push('d.ano = @ano');
    params.ano = Number(ano);
  }

  if (status) {
    filters.push('IFNULL(ld.status, d.status_coleta) = @status');
    params.status = status;
  }

  if (termo) {
    filters.push(
      '(d.titulo LIKE @termo OR IFNULL(d.numero, \'\') LIKE @termo OR IFNULL(d.resumo, \'\') LIKE @termo OR IFNULL(ld.modalidade, \'\') LIKE @termo)'
    );
    params.termo = likeParam(termo);
  }

  const whereClause = `WHERE ${filters.join(' AND ')}`;
  const total = db
    .prepare(
      `SELECT COUNT(*) AS total
       FROM documentos d
       LEFT JOIN licitacoes_detalhes ld ON ld.documento_id = d.id
       ${whereClause}`
    )
    .get(params).total;
  const offset = (pagina - 1) * limite;
  const rows = db
    .prepare(
      `SELECT d.id, d.fonte, d.tipo, d.numero, d.ano, d.titulo, d.resumo,
              d.data_publicacao, d.data_abertura, d.valor_estimado,
              d.url_origem, d.url_pdf, d.hash_conteudo, d.status_coleta,
              d.coletado_em, d.atualizado_em,
              LENGTH(IFNULL(d.texto_completo, '')) AS texto_completo_chars,
              ld.modalidade, ld.status, ld.vencedor_nome, ld.vencedor_cnpj,
              ld.valor_final, ld.numero_pncp, ld.data_homologacao,
              EXISTS (
                SELECT 1
                FROM documentos_resumos_ai rai
                WHERE rai.documento_id = d.id
                  AND rai.status = 'ok'
              ) AS tem_resumo_ai
       FROM documentos d
       LEFT JOIN licitacoes_detalhes ld ON ld.documento_id = d.id
       ${whereClause}
       ORDER BY COALESCE(d.data_abertura, d.data_publicacao, d.atualizado_em) DESC, d.id DESC
       LIMIT @limite OFFSET @offset`
    )
    .all({ ...params, limite, offset });

  return {
    total,
    pagina,
    limite,
    dados: rows.map(normalizeLicitacao)
  };
}

function getEstatisticas() {
  const totalDocumentos = db.prepare('SELECT COUNT(*) AS total FROM documentos').get().total;
  const totalLicitacoes = db
    .prepare("SELECT COUNT(*) AS total FROM documentos WHERE tipo = 'edital'")
    .get().total;
  const publicacoesRecentes = db
    .prepare(
      "SELECT COUNT(*) AS total FROM documentos WHERE COALESCE(data_publicacao, atualizado_em) >= datetime('now', '-30 day')"
    )
    .get().total;
  const ultimaColeta = db
    .prepare(
      "SELECT fonte, fim, status FROM coletas_log WHERE fim IS NOT NULL ORDER BY fim DESC LIMIT 1"
    )
    .get();
  const porFonte = db
    .prepare('SELECT fonte, COUNT(*) AS total FROM documentos GROUP BY fonte ORDER BY total DESC')
    .all();
  const porTipo = db
    .prepare('SELECT tipo, COUNT(*) AS total FROM documentos GROUP BY tipo ORDER BY total DESC')
    .all();
  const porAno = listAnosDocumentos();
  const valorEstimado = db
    .prepare("SELECT ROUND(IFNULL(SUM(valor_estimado), 0), 2) AS total FROM documentos WHERE tipo = 'edital'")
    .get().total;
  const statusColeta = db
    .prepare(
      'SELECT fonte, status, fim, itens_novos, itens_atualizados, itens_com_erro FROM coletas_log WHERE id IN (SELECT MAX(id) FROM coletas_log GROUP BY fonte)'
    )
    .all();
  const qualidadeDados = db
    .prepare(
      `SELECT
         SUM(CASE WHEN IFNULL(url_pdf, '') = '' THEN 1 ELSE 0 END) AS sem_pdf,
         SUM(CASE WHEN status_coleta = 'erro_pdf' THEN 1 ELSE 0 END) AS erro_pdf,
         SUM(CASE WHEN IFNULL(data_publicacao, '') = '' THEN 1 ELSE 0 END) AS sem_data,
         SUM(CASE WHEN IFNULL(resumo, '') = '' THEN 1 ELSE 0 END) AS sem_resumo
       FROM documentos`
    )
    .get();
  const qualidadePorAno = db
    .prepare(
      `SELECT
         COALESCE(CAST(ano AS TEXT), 'sem_ano') AS ano,
         COUNT(*) AS total,
         SUM(CASE WHEN IFNULL(url_pdf, '') = '' THEN 1 ELSE 0 END) AS sem_pdf,
         SUM(CASE WHEN status_coleta = 'erro_pdf' THEN 1 ELSE 0 END) AS erro_pdf,
         SUM(CASE WHEN IFNULL(data_publicacao, '') = '' THEN 1 ELSE 0 END) AS sem_data,
         SUM(CASE WHEN EXISTS (
           SELECT 1
           FROM documentos_resumos_ai rai
           WHERE rai.documento_id = documentos.id
             AND rai.status = 'ok'
         ) THEN 1 ELSE 0 END) AS com_resumo_ai
       FROM documentos
       GROUP BY COALESCE(CAST(ano AS TEXT), 'sem_ano')
       ORDER BY COALESCE(ano, 0) DESC`
    )
    .all();
  const qualidadePorFonte = db
    .prepare(
      `SELECT
         fonte,
         COUNT(*) AS total,
         SUM(CASE WHEN IFNULL(url_pdf, '') = '' THEN 1 ELSE 0 END) AS sem_pdf,
         SUM(CASE WHEN status_coleta = 'erro_pdf' THEN 1 ELSE 0 END) AS erro_pdf,
         SUM(CASE WHEN IFNULL(data_publicacao, '') = '' THEN 1 ELSE 0 END) AS sem_data,
         SUM(CASE WHEN EXISTS (
           SELECT 1
           FROM documentos_resumos_ai rai
           WHERE rai.documento_id = documentos.id
             AND rai.status = 'ok'
         ) THEN 1 ELSE 0 END) AS com_resumo_ai
       FROM documentos
       GROUP BY fonte
       ORDER BY total DESC`
    )
    .all();
  const qualidadePorTipo = db
    .prepare(
      `SELECT
         tipo,
         COUNT(*) AS total,
         SUM(CASE WHEN IFNULL(url_pdf, '') = '' THEN 1 ELSE 0 END) AS sem_pdf,
         SUM(CASE WHEN status_coleta = 'erro_pdf' THEN 1 ELSE 0 END) AS erro_pdf,
         SUM(CASE WHEN IFNULL(data_publicacao, '') = '' THEN 1 ELSE 0 END) AS sem_data,
         SUM(CASE WHEN EXISTS (
           SELECT 1
           FROM documentos_resumos_ai rai
           WHERE rai.documento_id = documentos.id
             AND rai.status = 'ok'
         ) THEN 1 ELSE 0 END) AS com_resumo_ai
       FROM documentos
       GROUP BY tipo
       ORDER BY total DESC`
    )
    .all();

  return {
    total_documentos: totalDocumentos,
    total_licitacoes: totalLicitacoes,
    publicacoes_recentes: publicacoesRecentes,
    valor_estimado_total: valorEstimado,
    ultima_coleta: ultimaColeta || null,
    por_fonte: porFonte.map((item) => ({ ...item, fonte_nome: labelFonte(item.fonte) })),
    por_tipo: porTipo.map((item) => ({ ...item, tipo_nome: labelTipo(item.tipo) })),
    por_ano: porAno,
    status_fontes: statusColeta.map((item) => ({
      ...item,
      fonte_nome: labelFonte(item.fonte),
      status_nome: labelStatus(item.status)
    })),
    qualidade_dados: {
      sem_pdf: qualidadeDados.sem_pdf || 0,
      erro_pdf: qualidadeDados.erro_pdf || 0,
      sem_data: qualidadeDados.sem_data || 0,
      sem_resumo: qualidadeDados.sem_resumo || 0
    },
    qualidade_por_ano: qualidadePorAno,
    qualidade_por_fonte: qualidadePorFonte.map((item) => ({
      ...item,
      fonte_nome: labelFonte(item.fonte)
    })),
    qualidade_por_tipo: qualidadePorTipo.map((item) => ({
      ...item,
      tipo_nome: labelTipo(item.tipo)
    }))
  };
}

function getPainelCidadao() {
  const estatisticas = getEstatisticas();
  const currentYear = new Date().getFullYear();
  const hasCurrentYear = estatisticas.por_ano.some((item) => Number(item.ano) === currentYear);
  const anoPadrao = hasCurrentYear ? currentYear : estatisticas.por_ano[0]?.ano;
  const recentes = listDocumentos({ pagina: 1, limite: 8 });
  const licitacoes = listLicitacoes({ ano: anoPadrao, pagina: 1, limite: 5 });
  const coletas = listColetasLog(5).map((item) => ({
    ...item,
    fonte_nome: labelFonte(item.fonte),
    status_nome: labelStatus(item.status)
  }));

  const alertas = [
    {
      tipo: 'sem_pdf',
      titulo: 'Documentos sem arquivo',
      total: estatisticas.qualidade_dados.sem_pdf,
      descricao: 'Registros com fonte oficial, mas sem arquivo anexado.'
    },
    {
      tipo: 'erro_pdf',
      titulo: 'Arquivos com falha de leitura',
      total: estatisticas.qualidade_dados.erro_pdf,
      descricao: 'Documentos encontrados em que o texto do arquivo oficial nao foi extraido corretamente.'
    },
    {
      tipo: 'sem_data',
      titulo: 'Registros sem data',
      total: estatisticas.qualidade_dados.sem_data,
      descricao: 'Itens em que a data de publicacao nao foi identificada.'
    }
  ];

  return {
    resumo: {
      total_documentos: estatisticas.total_documentos,
      total_licitacoes: estatisticas.total_licitacoes,
      publicacoes_recentes: estatisticas.publicacoes_recentes,
      ano_padrao: anoPadrao || null,
      valor_estimado_total: estatisticas.valor_estimado_total,
      ultima_coleta: estatisticas.ultima_coleta
        ? {
            ...estatisticas.ultima_coleta,
            fonte_nome: labelFonte(estatisticas.ultima_coleta.fonte),
            status_nome: labelStatus(estatisticas.ultima_coleta.status)
          }
        : null
    },
    publicacoes_recentes: recentes.dados,
    licitacoes_recentes: licitacoes.dados,
    anos: estatisticas.por_ano,
    fontes: estatisticas.por_fonte,
    qualidade_por_ano: estatisticas.qualidade_por_ano,
    qualidade_por_fonte: estatisticas.qualidade_por_fonte,
    qualidade_por_tipo: estatisticas.qualidade_por_tipo,
    ultimas_coletas: coletas,
    alertas_qualidade: alertas
  };
}

function getDocumentoById(id) {
  const documento = normalizeDocumento(
    db.prepare('SELECT * FROM documentos WHERE id = ?').get(id)
  );
  if (!documento) return null;

  const textoCompletoChars = documento.texto_completo ? documento.texto_completo.length : 0;
  const fontes = db
    .prepare(
      `SELECT fonte, url_origem, url_pdf, hash_conteudo, coletado_em
       FROM documentos_fontes
       WHERE documento_id = ?
       ORDER BY coletado_em DESC`
    )
    .all(id);

  const licitacao = db
    .prepare('SELECT * FROM licitacoes_detalhes WHERE documento_id = ?')
    .get(id);
  const resumoAi = getLatestResumoAiByDocumentoId(id);
  const textoHashAtual = documento.texto_completo ? buildTextoHash(documento.texto_completo) : null;
  const resumoAiJob = textoHashAtual
    ? getLatestResumoAiJobByDocumentoHash(id, textoHashAtual, config.aiContractVersion)
    : null;

  return {
    ...documento,
    origem_resumo: buildOrigemResumo(documento),
    indicadores: buildDocumentoIndicadores({
      ...documento,
      texto_completo_chars: textoCompletoChars,
      tem_resumo_ai: Boolean(resumoAi)
    }),
    texto_hash_atual: textoHashAtual,
    texto_completo_chars: textoCompletoChars,
    fontes_relacionadas: fontes,
    licitacao_detalhes: licitacao || null,
    resumo_ai_job: resumoAiJob,
    resumo_ai: resumoAi
      ? {
          provider: resumoAi.provider,
          modelo: resumoAi.modelo,
          contrato_versao: resumoAi.contrato_versao,
          criado_em: resumoAi.criado_em,
          atualizado_em: resumoAi.atualizado_em,
          texto_hash: resumoAi.texto_hash,
          corresponde_ao_texto_atual: textoHashAtual ? resumoAi.texto_hash === textoHashAtual : false,
          status: resumoAi.status,
          dados: resumoAi.resumo_json
        }
      : null
  };
}

function getResumoAiByDocumentoHash(documentoId, textoHash, contratoVersao) {
  return normalizeResumoAi(
    db
      .prepare(
        `SELECT *
         FROM documentos_resumos_ai
         WHERE documento_id = ?
           AND texto_hash = ?
           AND contrato_versao = ?
         LIMIT 1`
      )
      .get(documentoId, textoHash, contratoVersao)
  );
}

function getLatestResumoAiByDocumentoId(documentoId) {
  return normalizeResumoAi(
    db
      .prepare(
        `SELECT *
         FROM documentos_resumos_ai
         WHERE documento_id = ?
           AND status = 'ok'
           AND provider <> 'mock'
         ORDER BY datetime(criado_em) DESC, id DESC
         LIMIT 1`
      )
      .get(documentoId)
  );
}

function saveResumoAi({
  documento_id,
  provider,
  modelo,
  contrato_versao,
  resumo_json,
  texto_hash,
  tokens_estimados = null,
  status = 'ok',
  erro = null
}) {
  const now = new Date().toISOString();
  const payload = {
    documento_id,
    provider,
    modelo,
    contrato_versao,
    resumo_json: serializeJson(resumo_json),
    texto_hash,
    tokens_estimados,
    status,
    erro,
    criado_em: now,
    atualizado_em: now
  };

  db.prepare(
    `INSERT INTO documentos_resumos_ai (
      documento_id, provider, modelo, contrato_versao, resumo_json, texto_hash,
      tokens_estimados, status, erro, criado_em, atualizado_em
    ) VALUES (
      @documento_id, @provider, @modelo, @contrato_versao, @resumo_json, @texto_hash,
      @tokens_estimados, @status, @erro, @criado_em, @atualizado_em
    )
    ON CONFLICT(documento_id, texto_hash, contrato_versao) DO UPDATE SET
      provider = excluded.provider,
      modelo = excluded.modelo,
      resumo_json = excluded.resumo_json,
      tokens_estimados = excluded.tokens_estimados,
      status = excluded.status,
      erro = excluded.erro,
      atualizado_em = excluded.atualizado_em`
  ).run(payload);

  return getResumoAiByDocumentoHash(documento_id, texto_hash, contrato_versao);
}

function createResumoAiJob({
  documento_id,
  provider,
  modelo,
  contrato_versao,
  texto_hash,
  force = false
}) {
  const existing = db
    .prepare(
      `SELECT *
       FROM documentos_resumos_ai_jobs
       WHERE documento_id = @documento_id
         AND texto_hash = @texto_hash
         AND contrato_versao = @contrato_versao
         AND status IN ('pendente', 'processando')
       ORDER BY datetime(atualizado_em) DESC, id DESC
       LIMIT 1`
    )
    .get({ documento_id, texto_hash, contrato_versao });

  if (existing) {
    return normalizeResumoAiJob(existing);
  }

  const now = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO documentos_resumos_ai_jobs (
        documento_id, provider, modelo, contrato_versao, texto_hash,
        status, force, criado_em, atualizado_em
      ) VALUES (
        @documento_id, @provider, @modelo, @contrato_versao, @texto_hash,
        'pendente', @force, @criado_em, @atualizado_em
      )`
    )
    .run({
      documento_id,
      provider,
      modelo,
      contrato_versao,
      texto_hash,
      force: force ? 1 : 0,
      criado_em: now,
      atualizado_em: now
    });

  return getResumoAiJobById(result.lastInsertRowid);
}

function getResumoAiJobById(id) {
  return normalizeResumoAiJob(
    db.prepare('SELECT * FROM documentos_resumos_ai_jobs WHERE id = ?').get(id)
  );
}

function getLatestResumoAiJobByDocumentoHash(documentoId, textoHash, contratoVersao) {
  return normalizeResumoAiJob(
    db
      .prepare(
        `SELECT *
         FROM documentos_resumos_ai_jobs
         WHERE documento_id = ?
           AND texto_hash = ?
           AND contrato_versao = ?
         ORDER BY datetime(atualizado_em) DESC, id DESC
         LIMIT 1`
      )
      .get(documentoId, textoHash, contratoVersao)
  );
}

function getNextPendingResumoAiJob() {
  return normalizeResumoAiJob(
    db
      .prepare(
        `SELECT *
         FROM documentos_resumos_ai_jobs
         WHERE status = 'pendente'
         ORDER BY datetime(criado_em) ASC, id ASC
         LIMIT 1`
      )
      .get()
  );
}

function listResumoAiJobs({ limite = 20, status } = {}) {
  const filters = [];
  const params = {
    limite: Math.min(Math.max(Number(limite || 20), 1), 100)
  };

  if (status) {
    filters.push('j.status = @status');
    params.status = status;
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  return db
    .prepare(
      `SELECT
         j.*,
         d.titulo,
         d.ano,
         d.tipo,
         d.fonte,
         d.texto_completo,
         r.status AS resumo_status,
         r.erro AS resumo_erro,
         length(IFNULL(d.texto_completo, '')) AS texto_chars
       FROM documentos_resumos_ai_jobs j
       JOIN documentos d ON d.id = j.documento_id
       LEFT JOIN documentos_resumos_ai r ON r.id = j.resumo_ai_id
       ${whereClause}
       ORDER BY datetime(j.atualizado_em) DESC, j.id DESC
       LIMIT @limite`
    )
    .all(params)
    .map(normalizeResumoAiJob);
}

function getResumoAiJobsStats() {
  const porStatus = db
    .prepare(
      `SELECT status, COUNT(*) AS total
       FROM documentos_resumos_ai_jobs
       GROUP BY status
       ORDER BY total DESC`
    )
    .all();
  const porErro = db
    .prepare(
      `SELECT erro, COUNT(*) AS total
       FROM documentos_resumos_ai_jobs
       WHERE status = 'erro'
       GROUP BY erro
       ORDER BY total DESC
       LIMIT 10`
    )
    .all()
    .map((item) => ({
      ...item,
      erro_categoria: classifyAiError(item.erro)
    }));

  return {
    por_status: porStatus,
    por_erro: porErro
  };
}

function recoverStaleResumoAiJobs({ staleMinutes = 30 } = {}) {
  const now = new Date().toISOString();
  const threshold = new Date(Date.now() - Number(staleMinutes || 30) * 60 * 1000).toISOString();
  const result = db
    .prepare(
      `UPDATE documentos_resumos_ai_jobs
       SET status = 'pendente',
           erro = NULL,
           atualizado_em = @now
       WHERE status = 'processando'
         AND atualizado_em < @threshold`
    )
    .run({ now, threshold });

  return {
    recovered: result.changes,
    threshold,
    staleMinutes: Number(staleMinutes || 30)
  };
}

function markResumoAiJobProcessing(id) {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE documentos_resumos_ai_jobs
     SET status = 'processando',
         tentativas = tentativas + 1,
         iniciado_em = COALESCE(iniciado_em, @now),
         atualizado_em = @now
     WHERE id = @id
       AND status = 'pendente'`
  ).run({ id, now });

  return getResumoAiJobById(id);
}

function finishResumoAiJobOk(id, resumoAiId = null) {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE documentos_resumos_ai_jobs
     SET status = 'ok',
         erro = NULL,
         resumo_ai_id = @resumoAiId,
         finalizado_em = @now,
         atualizado_em = @now
     WHERE id = @id`
  ).run({ id, resumoAiId, now });

  return getResumoAiJobById(id);
}

function finishResumoAiJobError(id, erro) {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE documentos_resumos_ai_jobs
     SET status = 'erro',
         erro = @erro,
         finalizado_em = @now,
         atualizado_em = @now
     WHERE id = @id`
  ).run({ id, erro: String(erro || 'Erro desconhecido'), now });

  return getResumoAiJobById(id);
}

function listDocumentosPendentesResumoAi({ limite = 20, fonte, tipo, ano } = {}) {
  const filters = ["IFNULL(texto_completo, '') <> ''"];
  const params = { limite };

  if (fonte) {
    filters.push('fonte = @fonte');
    params.fonte = fonte;
  }

  if (tipo) {
    filters.push('tipo = @tipo');
    params.tipo = tipo;
  }

  if (ano) {
    filters.push('ano = @ano');
    params.ano = Number(ano);
  }

  return db
    .prepare(
      `SELECT d.*
       FROM documentos d
       WHERE ${filters.join(' AND ')}
       ORDER BY COALESCE(d.data_publicacao, d.atualizado_em) DESC, d.id DESC
       LIMIT @limite`
    )
    .all(params)
    .map(normalizeDocumento);
}

function listDocumentosParaResumoAi({
  limite = 20,
  fonte,
  tipo,
  ano,
  maxChars = null,
  minChars = null,
  contratoVersao = config.aiContractVersion
} = {}) {
  const candidateLimit = Math.max(Number(limite || 20) * 20, 200);
  return listDocumentosPendentesResumoAi({
    limite: candidateLimit,
    fonte,
    tipo,
    ano
  })
    .filter((documento) => {
      const textoCompleto = documento.texto_completo || '';
      if (!textoCompleto) return false;
      if (maxChars && textoCompleto.length > Number(maxChars)) return false;
      if (minChars && textoCompleto.length < Number(minChars)) return false;

      const textoHash = buildTextoHash(textoCompleto);
      const resumo = getResumoAiByDocumentoHash(documento.id, textoHash, contratoVersao);
      return resumo?.status !== 'ok';
    })
    .slice(0, Math.max(Number(limite || 20), 1));
}

function getResumoAiStatus({ fonte, tipo, ano } = {}) {
  const filters = ["IFNULL(d.texto_completo, '') <> ''"];
  const params = {};

  if (fonte) {
    filters.push('d.fonte = @fonte');
    params.fonte = fonte;
  }

  if (tipo) {
    filters.push('d.tipo = @tipo');
    params.tipo = tipo;
  }

  if (ano) {
    filters.push('d.ano = @ano');
    params.ano = Number(ano);
  }

  const whereClause = `WHERE ${filters.join(' AND ')}`;
  const porAnoTipo = db
    .prepare(
      `SELECT
         d.ano,
         d.tipo,
         COUNT(DISTINCT d.id) AS total_documentos,
         COUNT(DISTINCT CASE WHEN r.status = 'ok' THEN d.id END) AS com_resumo_ok,
         COUNT(DISTINCT CASE WHEN r.status = 'erro' THEN d.id END) AS com_resumo_erro
       FROM documentos d
       LEFT JOIN documentos_resumos_ai r ON r.documento_id = d.id
       ${whereClause}
       GROUP BY d.ano, d.tipo
       ORDER BY COALESCE(d.ano, 0) DESC, total_documentos DESC`
    )
    .all(params)
    .map((row) => ({
      ...row,
      sem_resumo_ok: row.total_documentos - row.com_resumo_ok
    }));

  const porProvider = db
    .prepare(
      `SELECT
         IFNULL(r.provider, 'sem_resumo') AS provider,
         IFNULL(r.modelo, 'sem_modelo') AS modelo,
         IFNULL(r.status, 'sem_status') AS status,
         COUNT(DISTINCT d.id) AS total
       FROM documentos d
       LEFT JOIN documentos_resumos_ai r ON r.documento_id = d.id
       ${whereClause}
       GROUP BY provider, modelo, status
       ORDER BY total DESC`
    )
    .all(params);

  const totais = db
    .prepare(
      `SELECT
         COUNT(DISTINCT d.id) AS total_documentos,
         COUNT(DISTINCT CASE WHEN r.status = 'ok' THEN d.id END) AS com_resumo_ok,
         COUNT(DISTINCT CASE WHEN r.status = 'erro' THEN d.id END) AS com_resumo_erro
       FROM documentos d
       LEFT JOIN documentos_resumos_ai r ON r.documento_id = d.id
       ${whereClause}`
    )
    .get(params);

  return {
    filtros: {
      fonte: fonte || null,
      tipo: tipo || null,
      ano: ano ? Number(ano) : null
    },
    totais: {
      ...totais,
      sem_resumo_ok: totais.total_documentos - totais.com_resumo_ok
    },
    por_ano_tipo: porAnoTipo,
    por_provider: porProvider
  };
}

function listResumoAnalises({ tipo, limite = 50 } = {}) {
  const filters = ["r.status = 'ok'", "r.provider <> 'mock'"];
  const params = {
    limite: Math.min(Math.max(Number(limite || 50), 1), 100)
  };

  if (tipo) {
    filters.push('d.tipo = @tipo');
    params.tipo = tipo;
  }

  const rows = db
    .prepare(
      `SELECT
         d.id AS documento_id,
         d.titulo,
         d.tipo,
         d.ano,
         d.fonte,
         d.numero,
         d.data_publicacao,
         d.data_abertura,
         d.valor_estimado,
         r.resumo_json,
         r.criado_em AS resumo_criado_em
       FROM documentos_resumos_ai r
       JOIN documentos d ON d.id = r.documento_id
       WHERE ${filters.join(' AND ')}
         AND r.id = (
           SELECT r2.id
           FROM documentos_resumos_ai r2
           WHERE r2.documento_id = r.documento_id
             AND r2.status = 'ok'
             AND r2.provider <> 'mock'
           ORDER BY datetime(r2.criado_em) DESC, r2.id DESC
           LIMIT 1
         )
       ORDER BY datetime(r.criado_em) DESC, r.id DESC
       LIMIT @limite`
    )
    .all(params);

  const itens = rows.map((row) => {
    const resumo = deepRepairStrings(parseJson(row.resumo_json)) || {};
    return {
      documento_id: row.documento_id,
      titulo: normalizeText(row.titulo),
      tipo: row.tipo,
      tipo_nome: labelTipo(row.tipo),
      ano: row.ano,
      fonte: row.fonte,
      fonte_nome: labelFonte(row.fonte),
      numero: row.numero,
      data_publicacao: row.data_publicacao,
      data_abertura: row.data_abertura,
      valor_estimado: row.valor_estimado,
      resumo_criado_em: row.resumo_criado_em,
      titulo_curto: resumo.titulo_curto || null,
      resumo_cidadao: resumo.resumo_cidadao || null,
      objeto: resumo.objeto?.descricao || null,
      pontos_principais: resumo.pontos_principais || [],
      valores: resumo.valores || [],
      datas_relevantes: resumo.datas_relevantes || [],
      partes_envolvidas: resumo.partes_envolvidas || [],
      riscos_ou_alertas: resumo.riscos_ou_alertas || [],
      confianca: resumo.confianca ?? null
    };
  });

  const porTipo = itens.reduce((acc, item) => {
    const current = acc.get(item.tipo) || {
      tipo: item.tipo,
      tipo_nome: item.tipo_nome,
      total: 0,
      com_valores: 0,
      com_riscos: 0
    };
    current.total += 1;
    if (item.valores.length) current.com_valores += 1;
    if (item.riscos_ou_alertas.length) current.com_riscos += 1;
    acc.set(item.tipo, current);
    return acc;
  }, new Map());

  return {
    filtros: {
      tipo: tipo || null,
      limite: params.limite
    },
    totais: {
      documentos_analisados: itens.length,
      com_valores: itens.filter((item) => item.valores.length).length,
      com_datas: itens.filter((item) => item.datas_relevantes.length).length,
      com_riscos: itens.filter((item) => item.riscos_ou_alertas.length).length
    },
    por_tipo: Array.from(porTipo.values()),
    itens
  };
}

function getDocumentoByUrlPdf(urlPdf) {
  if (!urlPdf) return null;
  return normalizeDocumento(
    db.prepare('SELECT * FROM documentos WHERE url_pdf = ? LIMIT 1').get(urlPdf)
  );
}

function getDocumentoByUrlPdfRaw(urlPdf) {
  if (!urlPdf) return null;
  return db.prepare('SELECT * FROM documentos WHERE url_pdf = ? LIMIT 1').get(urlPdf) || null;
}

function listColetasLog(limite = 10) {
  return db
    .prepare('SELECT * FROM coletas_log ORDER BY id DESC LIMIT ?')
    .all(limite)
    .map((item) => ({ ...item, detalhes: parseJson(item.detalhes) }));
}

module.exports = {
  db,
  saveDocumento,
  saveResumoAi,
  createColetaLog,
  finishColetaLog,
  listDocumentos,
  listAnosDocumentos,
  listLicitacoes,
  getEstatisticas,
  getPainelCidadao,
  getDocumentoById,
  getDocumentoByUrlPdf,
  getDocumentoByUrlPdfRaw,
  getResumoAiByDocumentoHash,
  getLatestResumoAiByDocumentoId,
  createResumoAiJob,
  getResumoAiJobById,
  getLatestResumoAiJobByDocumentoHash,
  getNextPendingResumoAiJob,
  listResumoAiJobs,
  getResumoAiJobsStats,
  recoverStaleResumoAiJobs,
  markResumoAiJobProcessing,
  finishResumoAiJobOk,
  finishResumoAiJobError,
  listDocumentosPendentesResumoAi,
  listDocumentosParaResumoAi,
  getResumoAiStatus,
  listResumoAnalises,
  listColetasLog,
  parseJson
};
