'use strict';

/**
 * Repositório de documentos — entidade central do sistema.
 * Tabelas: documentos
 *
 * Também exporta utilitários compartilhados (parseJson, buildTextoHash, etc.)
 * usados pelos outros repositórios de banco de dados.
 */

const crypto = require('crypto');
const { db } = require('./connection');
const { normalizeText, deepRepairStrings } = require('../utils/text');

// ── Utilitários compartilhados ────────────────────────────────────────────────

function parseJson(value) {
  if (!value) { return null; }
  try { return JSON.parse(value); } catch { return null; }
}

function serializeJson(value) {
  return value === null ? null : JSON.stringify(value);
}

function likeParam(value) {
  return `%${String(value).trim()}%`;
}

function buildDocumentoFtsQuery(value) {
  const terms = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/\s+/)
    .map((term) => term.replace(/[^a-zA-Z0-9_-]/g, '').trim())
    .filter(Boolean)
    .slice(0, 8);

  if (!terms.length) { return null; }
  if (terms.length === 1) { return `${terms[0]}*`; }
  return terms.map((term) => `${term}*`).join(' AND ');
}

function buildTextoHash(textoCompleto) {
  return crypto.createHash('sha256').update(String(textoCompleto || ''), 'utf8').digest('hex');
}

function buildJsonHash(value) {
  return buildTextoHash(JSON.stringify(value || {}));
}

// ── Labels de domínio ─────────────────────────────────────────────────────────

const FONTE_LABELS = {
  site_prefeitura: 'Prefeitura',
  camara: 'Câmara',
};

const TIPO_LABELS = {
  edital: 'Licitação/Edital',
  publicacao_extrato: 'Publicação de Extrato',
  lei: 'Lei',
  portaria: 'Portaria',
  contrato: 'Contrato',
  decreto: 'Decreto',
  documento: 'Documento',
  documento_publico: 'Documento Público',
  resolucao: 'Resolução',
};

const STATUS_LABELS = {
  ok: 'Coletado com sucesso',
  erro_pdf: 'Arquivo com falha de leitura',
  imagem: 'Arquivo em imagem (sem texto)',
  sem_pdf: 'Sem arquivo oficial',
  erro_total: 'Falha na coleta',
  erro_parcial: 'Coleta parcial',
  em_andamento: 'Coleta em andamento',
  aberta: 'Aberta',
  homologada: 'Homologada',
  deserta: 'Deserta',
  suspensa: 'Suspensa',
  revisar: 'Revisar',
};

function labelFonte(value) {
  return FONTE_LABELS[value] || value || 'Fonte nao informada';
}

function labelTipo(value) {
  return TIPO_LABELS[value] || value || 'Documento';
}

function labelStatus(value) {
  return STATUS_LABELS[value] || value || 'Sem status';
}

// ── Qualidade e indicadores ───────────────────────────────────────────────────

function buildQualidadeAlertas(documento) {
  const alertas = [];

  if (!documento.url_pdf) {
    alertas.push({
      tipo: 'sem_pdf',
      label: 'Sem arquivo oficial vinculado',
      descricao: 'A fonte original esta disponivel, mas nao ha arquivo anexado neste registro.',
    });
  }

  if (documento.status_coleta === 'erro_pdf') {
    alertas.push({
      tipo: 'erro_pdf',
      label: 'Arquivo com falha de leitura',
      descricao:
        'O documento foi localizado, mas o texto do arquivo oficial nao pode ser extraido corretamente.',
    });
  }

  if (documento.status_coleta === 'imagem') {
    alertas.push({
      tipo: 'imagem',
      label: 'Arquivo disponível apenas como imagem',
      descricao:
        'O arquivo foi localizado mas está em formato de imagem, sem texto extraível. A leitura por IA não está disponível para este documento.',
    });
  }

  if (!documento.data_publicacao && !documento.atualizado_em) {
    alertas.push({
      tipo: 'sem_data',
      label: 'Sem data identificada',
      descricao: 'Nao foi possivel identificar uma data de publicacao confiavel.',
    });
  }

  return alertas;
}

function buildDocumentoIndicadores(documento) {
  const temPdf = Boolean(documento.url_pdf);
  const temTextoExtraido = Boolean(
    documento.texto_completo || documento.texto_completo_chars > 0
  );
  const temResumoAi = Boolean(documento.tem_resumo_ai || documento.resumo_ai);
  const alertas = buildQualidadeAlertas(documento);

  return {
    tem_pdf: temPdf,
    tem_texto_extraido: temTextoExtraido,
    tem_resumo_ai: temResumoAi,
    tem_alertas_qualidade: alertas.length > 0,
    dados_incompletos: alertas.length > 0,
    total_alertas_qualidade: alertas.length,
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
    atualizado_em: documento.atualizado_em || null,
  };
}

// ── Normalização de documento ─────────────────────────────────────────────────

function decorateDocumento(documento) {
  if (!documento) { return null; }
  const qualidadeAlertas = buildQualidadeAlertas(documento);

  return {
    ...documento,
    fonte_nome: labelFonte(documento.fonte),
    tipo_nome: labelTipo(documento.tipo),
    status_coleta_nome: labelStatus(documento.status_coleta),
    origem_resumo: buildOrigemResumo(documento),
    indicadores: buildDocumentoIndicadores(documento),
    qualidade_alertas: qualidadeAlertas,
  };
}

function normalizeDocumento(row) {
  if (!row) { return null; }
  return decorateDocumento({
    ...Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        typeof value === 'string' ? normalizeText(value) : value,
      ])
    ),
    dados_extras: deepRepairStrings(parseJson(row.dados_extras)),
  });
}

// ── Helpers de campos ─────────────────────────────────────────────────────────

function cleanField(value) {
  if (value === null) { return null; }
  const text = normalizeText(String(value)).replace(/\s+/g, ' ').trim();
  if (!text || /^https?:\/\/$/i.test(text)) { return null; }
  return text;
}

function compactField(value, maxLength = 420) {
  const text = cleanField(value);
  if (!text) { return null; }
  if (text.length <= maxLength) { return text; }
  return `${text.slice(0, maxLength - 1).trim()}...`;
}

function normalizeCampoKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function getCampo(campos, matches) {
  const normalizedMatches = matches.map(normalizeCampoKey);
  const entry = Object.entries(campos || {}).find(([key]) => {
    const normalizedKey = normalizeCampoKey(key);
    return normalizedMatches.some((match) => normalizedKey.includes(match));
  });
  return entry ? cleanField(entry[1]) : null;
}

function isUsableUrl(value) {
  const text = cleanField(value);
  return text && /^https?:\/\/.+/i.test(text) ? text : null;
}

// ── Helpers de licitação (usado pelo domínio licitações, definido aqui por deps) ──

function classifyAnexo(nome) {
  const text = normalizeCampoKey(nome);
  if (text.includes('edital')) { return 'edital'; }
  if (text.includes('ata')) { return 'ata'; }
  if (text.includes('classifica')) { return 'classificacao'; }
  if (text.includes('homologa')) { return 'homologacao'; }
  if (text.includes('resultado')) { return 'resultado'; }
  if (text.includes('contrato') || text.includes('extrato')) { return 'contrato'; }
  if (text.includes('proposta')) { return 'proposta'; }
  if (text.includes('recurso')) { return 'recurso'; }
  return 'outro';
}

function normalizeModalidadeLicitacao(value) {
  const text = normalizeCampoKey(value);
  if (!text) { return null; }
  if (text.includes('pregao') && text.includes('eletronico')) { return 'Pregao eletronico'; }
  if (text.includes('pregao')) { return 'Pregao presencial'; }
  if (text.includes('dispensa') || text.includes('dispnsa')) { return 'Dispensa'; }
  if (text.includes('adesao')) { return 'Adesao'; }
  if (text.includes('inexigibilidade')) { return 'Inexigibilidade'; }
  if (text.includes('tomada')) { return 'Tomada de precos'; }
  if (text.includes('concorrencia')) { return 'Concorrencia'; }
  if (text.includes('chamamento') || text.includes('chamada')) { return 'Chamamento publico'; }
  if (text.includes('credenciamento') || text.includes('credencimento')) { return 'Credenciamento'; }
  if (text.includes('leilao')) { return 'Leilao'; }
  if (/^\d+\/\d+$/.test(text)) { return null; }
  return cleanField(value);
}

// ── Queries de documentos ─────────────────────────────────────────────────────

/**
 * Constrói cláusula WHERE para queries de documentos.
 * @param {{ fonte, tipo, ano, status, termo, qualidade }} filtros
 * @param {object} params - objeto mutável de parâmetros para prepared statement
 * @returns {string} cláusula WHERE (ou string vazia)
 */
function buildDocumentoWhere({ fonte, tipo, ano, status, termo, qualidade }, params) {
  const filters = [];

  if (fonte) { filters.push('fonte = @fonte'); params.fonte = fonte; }
  if (tipo) { filters.push('tipo = @tipo'); params.tipo = tipo; }
  if (ano) { filters.push('ano = @ano'); params.ano = Number(ano); }
  if (status) { filters.push('status_coleta = @status'); params.status = status; }

  if (termo) {
    const ftsTerm = buildDocumentoFtsQuery(termo);
    const textFilters = [
      'titulo LIKE @termo',
      'resumo LIKE @termo',
      "IFNULL(numero, '') LIKE @termo",
    ];
    if (ftsTerm) {
      textFilters.push('id IN (SELECT rowid FROM documentos_fts WHERE documentos_fts MATCH @ftsTerm)');
      params.ftsTerm = ftsTerm;
    }
    filters.push(`(${textFilters.join(' OR ')})`);
    params.termo = likeParam(termo);
  }

  if (qualidade === 'sem_pdf') { filters.push("IFNULL(url_pdf, '') = ''"); }
  if (qualidade === 'erro_pdf') { filters.push("status_coleta = 'erro_pdf'"); }
  if (qualidade === 'sem_data') { filters.push("IFNULL(data_publicacao, '') = ''"); }

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
              d.dados_extras,
              d.coletado_em, d.atualizado_em,
              LENGTH(IFNULL(d.texto_completo, '')) AS texto_completo_chars,
              EXISTS (
                SELECT 1
                FROM documentos_resumos_ai rai
                WHERE rai.documento_id = d.id
                  AND rai.status = 'ok'
                  AND rai.contrato_versao NOT LIKE '2.%'
              ) AS tem_resumo_ai
              ,
              (
                SELECT lg.total_documentos
                FROM licitacoes_grupo_documentos lgd
                JOIN licitacoes_grupos lg ON lg.id = lgd.grupo_id
                WHERE lgd.documento_id = d.id
                LIMIT 1
              ) AS grupo_total_documentos,
              EXISTS (
                SELECT 1
                FROM licitacoes_grupo_documentos lgd
                JOIN licitacoes_grupos lg ON lg.id = lgd.grupo_id
                WHERE lgd.documento_id = d.id
                  AND lg.total_documentos > 1
              ) AS tem_grupo_licitacao,
              EXISTS (
                SELECT 1
                FROM licitacoes_fontes_relacionadas lfr
                WHERE lfr.documento_id = d.id
                  AND lfr.fonte = 'pncp'
                  AND lfr.status_correspondencia <> 'rejeitada'
              ) AS tem_pncp,
              (
                SELECT COUNT(*)
                FROM licitacoes_fontes_relacionadas lfr
                WHERE lfr.documento_id = d.id
                  AND lfr.fonte = 'pncp'
                  AND lfr.status_correspondencia <> 'rejeitada'
              ) AS pncp_fontes_total,
              EXISTS (
                SELECT 1
                FROM documentos_resumos_ai rai2
                WHERE rai2.documento_id = d.id
                  AND rai2.status = 'ok'
                  AND rai2.provider <> 'mock'
                  AND rai2.contrato_versao = '2.0'
              ) AS tem_leitura_integrada
       FROM documentos d
       ${whereClause}
       ORDER BY COALESCE(ano, 0) DESC, COALESCE(data_publicacao, data_abertura) DESC, id DESC
       LIMIT @limite OFFSET @offset`
    )
    .all({ ...params, limite, offset });

  return { total, pagina, limite, dados: rows.map(normalizeDocumento) };
}

function listPublicacoesRecentes({ limite = 8 } = {}) {
  const rows = db
    .prepare(
      `SELECT d.id, d.fonte, d.tipo, d.numero, d.ano, d.titulo, d.resumo,
              d.data_publicacao, d.data_abertura, d.valor_estimado,
              d.url_origem, d.url_pdf, d.hash_conteudo, d.status_coleta,
              d.dados_extras, d.coletado_em, d.atualizado_em,
              LENGTH(IFNULL(d.texto_completo, '')) AS texto_completo_chars
         FROM documentos d
        WHERE date(d.data_publicacao) IS NOT NULL
          AND date(d.data_publicacao) <= date('now', 'localtime')
        ORDER BY date(d.data_publicacao) DESC, d.id DESC
        LIMIT @limite`
    )
    .all({ limite: Math.min(Math.max(Number(limite) || 8, 1), 100) });
  return rows.map(normalizeDocumento);
}

function listAnosDocumentos({ fonte, tipo } = {}) {
  const filters = ['ano IS NOT NULL'];
  const params = {};

  if (fonte) { filters.push('fonte = @fonte'); params.fonte = fonte; }
  if (tipo) { filters.push('tipo = @tipo'); params.tipo = tipo; }

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

function getDocumentoByUrlPdf(urlPdf) {
  if (!urlPdf) { return null; }
  return normalizeDocumento(
    db.prepare('SELECT * FROM documentos WHERE url_pdf = ? LIMIT 1').get(urlPdf)
  );
}

function getDocumentoByUrlPdfRaw(urlPdf) {
  if (!urlPdf) { return null; }
  return db.prepare('SELECT * FROM documentos WHERE url_pdf = ? LIMIT 1').get(urlPdf) || null;
}

module.exports = {
  // Utilitários compartilhados
  parseJson,
  serializeJson,
  likeParam,
  buildDocumentoFtsQuery,
  buildTextoHash,
  buildJsonHash,
  // Labels
  labelFonte,
  labelTipo,
  labelStatus,
  // Qualidade e indicadores
  buildQualidadeAlertas,
  buildDocumentoIndicadores,
  buildOrigemResumo,
  // Normalização
  decorateDocumento,
  normalizeDocumento,
  // Helpers de campos
  cleanField,
  compactField,
  normalizeCampoKey,
  getCampo,
  isUsableUrl,
  // Helpers de licitação (definidos aqui por dependência de campo helpers)
  classifyAnexo,
  normalizeModalidadeLicitacao,
  // Queries
  buildDocumentoWhere,
  listDocumentos,
  listPublicacoesRecentes,
  listAnosDocumentos,
  getDocumentoByUrlPdf,
  getDocumentoByUrlPdfRaw,
};
