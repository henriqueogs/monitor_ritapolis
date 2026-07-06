'use strict';

/**
 * Repositório FTS5 — busca textual em documentos.
 * Usa SQLite FTS5 com tokenizer unicode61 (remove_diacritics).
 * A entrada do usuario e sanitizada antes de chegar ao operador MATCH.
 */

const { db } = require('./index');

// ── Índice inicial ────────────────────────────────────────────────────────────

/**
 * (Re)constrói o índice FTS5 com todos os documentos existentes.
 * Idempotente — limpa e reconstrói. Usar apenas na inicialização ou manutenção.
 */
function rebuildFtsIndex() {
  // Verifica se a tabela existe
  const existe = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='documentos_fts'").get();
  if (!existe) {
    throw new Error('Tabela documentos_fts não existe — execute setupDatabase() primeiro');
  }

  // Rebuild atômico via mecanismo nativo do FTS5
  db.exec("INSERT INTO documentos_fts(documentos_fts) VALUES('rebuild')");
  return db.prepare('SELECT COUNT(*) n FROM documentos_fts').get().n;
}

/**
 * Verifica se o índice FTS está realmente populado (não só a content table).
 * Faz uma query de teste — se retornar 0 para termos comuns, precisa rebuild.
 */
function isFtsIndexReady() {
  try {
    // Testa com termos comuns em documentos de licitação
    const testTerms = ['dispensa', 'pregão', 'processo', 'edital'];
    for (const term of testTerms) {
      const n = db.prepare(`SELECT COUNT(*) n FROM documentos_fts WHERE documentos_fts MATCH ?`).get(term).n;
      if (n > 0) {return true;}
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Inicializa o índice se vazio ou inválido (chamado no startup).
 * Usa uma query de sanidade antes de decidir se precisa rebuild.
 */
function ensureFtsIndex() {
  if (!isFtsIndexReady()) {
    const n = rebuildFtsIndex();
    return { rebuiltRows: n };
  }
  return { rebuiltRows: 0 };
}

// ── Busca ─────────────────────────────────────────────────────────────────────

const LIMITE_DEFAULT = 20;
const LIMITE_MAX = 100;
const SNIPPET_LENGTH = 64; // chars por snippet

/**
 * Sanitiza a query para o FTS5 — previne erros de sintaxe.
 * Converte termos simples para busca de prefixo automático.
 */
function sanitizeFtsQuery(rawQuery) {
  if (!rawQuery || !rawQuery.trim()) {return null;}
  const terms = String(rawQuery)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/\s+/)
    .map((term) => term.replace(/[^a-zA-Z0-9_-]/g, '').trim())
    .filter((term) => !['AND', 'OR', 'NOT'].includes(term.toUpperCase()))
    .filter(Boolean)
    .slice(0, 8);

  if (!terms.length) { return null; }
  if (terms.length === 1) {
    // Busca de prefixo para termo único
    return `${terms[0]}*`;
  }
  return terms.map((t) => `${t}*`).join(' AND ');
}

/**
 * Busca full-text nos documentos.
 * @param {string} query - termos de busca
 * @param {{ limite, pagina, tipo, fonte, ano }} opcoes
 */
function searchDocumentos(query, { limite = LIMITE_DEFAULT, pagina = 1, tipo, fonte, ano } = {}) {
  const ftsQuery = sanitizeFtsQuery(query);
  if (!ftsQuery) {return { total: 0, pagina, limite, dados: [], query_usada: null };}

  const limiteReal = Math.min(LIMITE_MAX, Number(limite) || LIMITE_DEFAULT);
  const offset = (Math.max(1, Number(pagina)) - 1) * limiteReal;

  // Filtros adicionais nos campos estruturados
  const extraFilters = [];
  const extraParams = [];
  if (tipo) { extraFilters.push('d.tipo = ?'); extraParams.push(tipo); }
  if (fonte) { extraFilters.push('d.fonte = ?'); extraParams.push(fonte); }
  if (ano) { extraFilters.push('d.ano = ?'); extraParams.push(Number(ano)); }
  const extraWhere = extraFilters.length ? `AND ${extraFilters.join(' AND ')}` : '';

  try {
    const totalRow = db.prepare(`
      SELECT COUNT(*) n
      FROM documentos_fts fts
      JOIN documentos d ON d.id = fts.rowid
      WHERE documentos_fts MATCH ?
      ${extraWhere}
    `).get(ftsQuery, ...extraParams);

    const dados = db.prepare(`
      SELECT
        d.id, d.tipo, d.fonte, d.numero, d.ano, d.titulo,
        d.data_publicacao, d.url_pdf, d.url_origem,
        d.valor_estimado,
        snippet(documentos_fts, 2, '<mark>', '</mark>', '…', ${SNIPPET_LENGTH}) AS snippet_texto,
        snippet(documentos_fts, 0, '<mark>', '</mark>', '…', ${SNIPPET_LENGTH}) AS snippet_titulo,
        bm25(documentos_fts) AS rank
      FROM documentos_fts fts
      JOIN documentos d ON d.id = fts.rowid
      WHERE documentos_fts MATCH ?
      ${extraWhere}
      ORDER BY rank
      LIMIT ? OFFSET ?
    `).all(ftsQuery, ...extraParams, limiteReal, offset);

    return {
      total: totalRow?.n || 0,
      pagina: Number(pagina),
      limite: limiteReal,
      query_usada: ftsQuery,
      dados,
    };
  } catch (err) {
    // FTS query inválida — fallback para LIKE simples
    const fallback = String(query).slice(0, 100);
    const dados = db.prepare(`
      SELECT id, tipo, fonte, numero, ano, titulo, data_publicacao, url_pdf, url_origem, valor_estimado
      FROM documentos
      WHERE titulo LIKE ? OR resumo LIKE ?
      LIMIT ? OFFSET ?
    `).all(`%${fallback}%`, `%${fallback}%`, limiteReal, offset);
    return {
      total: dados.length,
      pagina: Number(pagina),
      limite: limiteReal,
      query_usada: `LIKE:%${fallback}%`,
      fallback: true,
      dados,
    };
  }
}

module.exports = { searchDocumentos, ensureFtsIndex, rebuildFtsIndex, isFtsIndexReady, sanitizeFtsQuery };
