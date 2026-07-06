'use strict';

/**
 * Repositório: dados do Portal da Transparência (SH3 — pt.ritapolis.mg.gov.br).
 * Armazena despesas (empenhos/liquidações/pagamentos) e licitações do portal
 * de transparência, separados dos documentos coletados do site principal.
 */

const crypto = require('crypto');
const { db } = require('./index');
const { parseModalidadeDespesa, parseModalidadeEdital } = require('../licitacoes/modalidade');
const { sanitizeFtsQuery } = require('./fts-repo');

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

function ensureTransparenciaSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS transparencia_receitas (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      exercicio        INTEGER NOT NULL,
      codigo_receita   TEXT NOT NULL,
      nome_receita     TEXT,
      tipo_conta       TEXT,
      valor_previsto   REAL NOT NULL DEFAULT 0,
      coletado_em      TEXT DEFAULT CURRENT_TIMESTAMP,
      atualizado_em    TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (exercicio, codigo_receita)
    );
  `);

  db.exec('CREATE INDEX IF NOT EXISTS idx_transp_receitas_exercicio ON transparencia_receitas(exercicio);');

  db.exec(`
    CREATE TABLE IF NOT EXISTS transparencia_despesas (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      documento_id         INTEGER REFERENCES documentos(id) ON DELETE SET NULL,
      exercicio_orcamento  INTEGER NOT NULL,
      empenho              TEXT NOT NULL,
      tipo                 TEXT,
      data_empenho         TEXT,
      data_liquidacao      TEXT,
      data_pagamento       TEXT,
      credor_nome          TEXT,
      credor_cnpj          TEXT,
      valor                REAL NOT NULL DEFAULT 0,
      unidade              TEXT,
      funcao               TEXT,
      subfuncao            TEXT,
      programa             TEXT,
      projeto_atividade    TEXT,
      categoria_economica  TEXT,
      fonte_recurso        TEXT,
      historico            TEXT,
      licitacao_ref        TEXT,
      modalidade           TEXT,
      dados_extras         TEXT,
      hash_despesa         TEXT NOT NULL,
      coletado_em          TEXT DEFAULT CURRENT_TIMESTAMP,
      atualizado_em        TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (exercicio_orcamento, empenho)
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS transparencia_coletas_log (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      fonte         TEXT NOT NULL DEFAULT 'portal_transparencia',
      tipo          TEXT NOT NULL,
      exercicio     INTEGER NOT NULL,
      mes           INTEGER,
      registros     INTEGER NOT NULL DEFAULT 0,
      novos         INTEGER NOT NULL DEFAULT 0,
      atualizados   INTEGER NOT NULL DEFAULT 0,
      status        TEXT NOT NULL DEFAULT 'ok',
      erro          TEXT,
      coletado_em   TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (tipo, exercicio, mes)
    );
  `);

  db.exec('CREATE INDEX IF NOT EXISTS idx_transp_despesas_exercicio ON transparencia_despesas(exercicio_orcamento);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_transp_despesas_empenho ON transparencia_despesas(empenho);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_transp_despesas_credor_cnpj ON transparencia_despesas(credor_cnpj);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_transp_despesas_data_empenho ON transparencia_despesas(data_empenho);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_transp_despesas_licitacao_ref ON transparencia_despesas(licitacao_ref);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_transp_despesas_documento_id ON transparencia_despesas(documento_id);');
}

ensureTransparenciaSchema();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hashDespesa(exercicioOrcamento, empenho) {
  return crypto
    .createHash('sha256')
    .update(`${exercicioOrcamento}|${empenho}`)
    .digest('hex')
    .slice(0, 16);
}

function extractCnpj(credorStr) {
  const m = String(credorStr || '').match(/CNPJ:\s*([\d./-]+)/i);
  if (!m) {return null;}
  return m[1].replace(/\D/g, '');
}

function extractCredorNome(credorStr) {
  const m = String(credorStr || '').match(/^(.+?)\s*[-–]\s*CPF\/CNPJ:/i);
  return m ? m[1].trim() : (credorStr || null);
}

// ---------------------------------------------------------------------------
// Upsert de despesa
// ---------------------------------------------------------------------------

const upsertDespesaStmt = db.prepare(`
  INSERT INTO transparencia_despesas (
    exercicio_orcamento, empenho, tipo,
    data_empenho, data_liquidacao, data_pagamento,
    credor_nome, credor_cnpj, valor,
    unidade, funcao, subfuncao, programa, projeto_atividade,
    categoria_economica, fonte_recurso, historico,
    licitacao_ref, modalidade, dados_extras, hash_despesa
  ) VALUES (
    @exercicio_orcamento, @empenho, @tipo,
    @data_empenho, @data_liquidacao, @data_pagamento,
    @credor_nome, @credor_cnpj, @valor,
    @unidade, @funcao, @subfuncao, @programa, @projeto_atividade,
    @categoria_economica, @fonte_recurso, @historico,
    @licitacao_ref, @modalidade, @dados_extras, @hash_despesa
  )
  ON CONFLICT (exercicio_orcamento, empenho) DO UPDATE SET
    tipo               = excluded.tipo,
    data_empenho       = excluded.data_empenho,
    data_liquidacao    = excluded.data_liquidacao,
    data_pagamento     = excluded.data_pagamento,
    credor_nome        = excluded.credor_nome,
    credor_cnpj        = excluded.credor_cnpj,
    valor              = excluded.valor,
    unidade            = excluded.unidade,
    funcao             = excluded.funcao,
    subfuncao          = excluded.subfuncao,
    programa           = excluded.programa,
    projeto_atividade  = excluded.projeto_atividade,
    categoria_economica= excluded.categoria_economica,
    fonte_recurso      = excluded.fonte_recurso,
    historico          = excluded.historico,
    licitacao_ref      = excluded.licitacao_ref,
    modalidade         = excluded.modalidade,
    dados_extras       = excluded.dados_extras,
    hash_despesa       = excluded.hash_despesa,
    atualizado_em      = CURRENT_TIMESTAMP
`);

/**
 * Converte um item `dadosPrincipais` da API SH3 para o formato do repositório
 * e salva/atualiza no banco.
 * @returns {'inserted'|'updated'}
 */
function upsertDespesa(dadosPrincipais) {
  const p = dadosPrincipais;
  const exercicio = Number(p.exercicio);
  const empenho = String(p.empenho || '').trim();
  if (!exercicio || !empenho) {return null;}

  const credorRaw = p.credor || '';
  const hash = hashDespesa(exercicio, empenho);

  const existing = db.prepare(
    'SELECT hash_despesa FROM transparencia_despesas WHERE exercicio_orcamento = ? AND empenho = ?'
  ).get(exercicio, empenho);

  upsertDespesaStmt.run({
    exercicio_orcamento: exercicio,
    empenho,
    tipo: p.tipo || null,
    data_empenho: p.dataDoEmpenho || null,
    data_liquidacao: p.dataDeLiquidacao || null,
    data_pagamento: p.dataDePagamento || null,
    credor_nome: extractCredorNome(credorRaw),
    credor_cnpj: extractCnpj(credorRaw),
    valor: Number(p.valor) || 0,
    unidade: p.unidade || null,
    funcao: p.funcao || null,
    subfuncao: p.subfuncao || null,
    programa: p.programa || null,
    projeto_atividade: p.projetoAtividade || null,
    categoria_economica: p.categoriaEconomica || null,
    fonte_recurso: p.fonteDeRecurso || null,
    historico: p.historico || null,
    licitacao_ref: p.licitacao || null,
    modalidade: p.modalidade || null,
    dados_extras: JSON.stringify(p),
    hash_despesa: hash,
  });

  return existing ? 'updated' : 'inserted';
}

// ---------------------------------------------------------------------------
// Crosswalk: vincular despesa → documento
// ---------------------------------------------------------------------------

/**
 * Índice de editais por chave de modalidade "tipo|numero|ano" → documento_id.
 * A chave vem de parseModalidadeEdital sobre o título (a modalidade, não o
 * número do processo). Construído uma vez por execução do crosswalk.
 */
function construirIndiceEditaisPorModalidade() {
  const editais = db
    .prepare(
      "SELECT id, titulo FROM documentos WHERE tipo = 'edital' OR tipo = 'publicacao_extrato' ORDER BY id ASC"
    )
    .all();

  const indice = new Map();
  for (const edital of editais) {
    const mod = parseModalidadeEdital(edital.titulo);
    if (!mod || mod.numero === null) {
      continue;
    }
    const chave = `${mod.tipo}|${mod.numero}|${mod.ano}`;
    if (!indice.has(chave)) {
      indice.set(chave, edital.id);
    }
  }
  return indice;
}

/**
 * Vincula despesas ao edital correspondente por correspondência EXATA de
 * modalidade (tipo + número + ano). Substitui o match por LIKE de número solto,
 * que casava o número da modalidade com o número do processo e ignorava o tipo.
 *
 * @param {{ relink?: boolean }} [opcoes] relink=true reavalia TODAS as despesas
 *   (limpa documento_id derivado e reconstrói) — usado para corrigir links antigos.
 * @returns {number} quantidade de vínculos criados
 */
function crosswalkDespesasDocumentos({ relink = false } = {}) {
  if (relink) {
    db.prepare('UPDATE transparencia_despesas SET documento_id = NULL WHERE documento_id IS NOT NULL').run();
  }

  const pendentes = db
    .prepare(
      `SELECT id, modalidade FROM transparencia_despesas
        WHERE documento_id IS NULL AND modalidade IS NOT NULL AND modalidade != ''`
    )
    .all();

  const indice = construirIndiceEditaisPorModalidade();
  const update = db.prepare(
    'UPDATE transparencia_despesas SET documento_id = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?'
  );

  let vinculados = 0;
  for (const desp of pendentes) {
    const mod = parseModalidadeDespesa(desp.modalidade);
    if (!mod || mod.numero === null) {
      continue;
    }
    const documentoId = indice.get(`${mod.tipo}|${mod.numero}|${mod.ano}`);
    if (documentoId) {
      update.run(documentoId, desp.id);
      vinculados += 1;
    }
  }

  return vinculados;
}

// ---------------------------------------------------------------------------
// Enriquecimento de licitacoes_detalhes com dados reais de empenho
// ---------------------------------------------------------------------------

/**
 * Para cada documento vinculado, atualiza licitacoes_detalhes com
 * vencedor e valor final se ainda não tiver dados de boa qualidade.
 * @returns {number} quantidade de detalhes enriquecidos
 */
function enriquecerDetalhesComEmpenhos() {
  // Agrupar empenhos por documento_id para encontrar credor principal
  const grupos = db.prepare(`
    SELECT
      documento_id,
      credor_nome,
      credor_cnpj,
      SUM(valor) as valor_total,
      COUNT(*) as n_empenhos
    FROM transparencia_despesas
    WHERE documento_id IS NOT NULL
      AND credor_cnpj IS NOT NULL
      AND credor_cnpj != ''
      AND tipo NOT LIKE '%INSS%'
      AND tipo NOT LIKE '%Extra%'
    GROUP BY documento_id, credor_cnpj
    ORDER BY valor_total DESC
  `).all();

  // Manter apenas o credor com maior valor por documento
  const melhorPorDoc = new Map();
  for (const g of grupos) {
    const key = g.documento_id;
    if (!melhorPorDoc.has(key) || g.valor_total > melhorPorDoc.get(key).valor_total) {
      melhorPorDoc.set(key, g);
    }
  }

  let enriquecidos = 0;
  for (const [docId, grupo] of melhorPorDoc) {
    // Só atualizar se o campo vencedor_cnpj ainda está vazio ou origem é 'ia_resumo'
    const atual = db.prepare(
      'SELECT vencedor_cnpj, origem FROM licitacoes_detalhes WHERE documento_id = ?'
    ).get(docId);

    if (!atual) {continue;}
    if (atual.vencedor_cnpj && atual.origem === 'portal_transparencia') {continue;}

    db.prepare(`
      INSERT INTO licitacoes_detalhes (documento_id, vencedor_nome, vencedor_cnpj, valor_final, origem, origem_detalhe)
      VALUES (@docId, @nome, @cnpj, @valor, 'portal_transparencia', 'empenho_agregado')
      ON CONFLICT (documento_id) DO UPDATE SET
        vencedor_nome  = CASE WHEN excluded.vencedor_nome IS NOT NULL AND vencedor_cnpj IS NULL THEN excluded.vencedor_nome ELSE vencedor_nome END,
        vencedor_cnpj  = CASE WHEN excluded.vencedor_cnpj IS NOT NULL AND vencedor_cnpj IS NULL THEN excluded.vencedor_cnpj ELSE vencedor_cnpj END,
        valor_final    = CASE WHEN vencedor_cnpj IS NULL THEN excluded.valor_final ELSE valor_final END,
        origem         = CASE WHEN vencedor_cnpj IS NULL THEN 'portal_transparencia' ELSE origem END,
        atualizado_em  = CURRENT_TIMESTAMP
    `).run({ docId, nome: grupo.credor_nome, cnpj: grupo.credor_cnpj, valor: grupo.valor_total });

    enriquecidos++;
  }

  return enriquecidos;
}

// ---------------------------------------------------------------------------
// Upsert de receita (orçamento anual previsto)
// ---------------------------------------------------------------------------

const upsertReceitaStmt = db.prepare(`
  INSERT INTO transparencia_receitas (exercicio, codigo_receita, nome_receita, tipo_conta, valor_previsto)
  VALUES (@exercicio, @codigo_receita, @nome_receita, @tipo_conta, @valor_previsto)
  ON CONFLICT (exercicio, codigo_receita) DO UPDATE SET
    nome_receita   = excluded.nome_receita,
    tipo_conta     = excluded.tipo_conta,
    valor_previsto = excluded.valor_previsto,
    atualizado_em  = CURRENT_TIMESTAMP
`);

/**
 * Salva um item da API orcamento_anual_de_receita.
 * @param {number} exercicio
 * @param {{ codigoDaReceita, nomeReceita, tipoDeContaDaReceita, valor }} item
 * @returns {'inserted'|'updated'}
 */
function upsertReceita(exercicio, item) {
  const existing = db.prepare(
    'SELECT id FROM transparencia_receitas WHERE exercicio = ? AND codigo_receita = ?'
  ).get(exercicio, item.codigoDaReceita);

  upsertReceitaStmt.run({
    exercicio,
    codigo_receita: item.codigoDaReceita,
    nome_receita: item.nomeReceita || null,
    tipo_conta: item.tipoDeContaDaReceita || null,
    valor_previsto: Number(item.valor) || 0,
  });

  return existing ? 'updated' : 'inserted';
}

/**
 * Retorna o orçamento previsto de receitas agrupado por exercício.
 * Soma apenas categorias de nível 1 (X.0.0.0.00.0.0) para evitar dupla contagem
 * da hierarquia sintética/analítica. Nível 1 = totalização correta do orçamento.
 */
function getReceitasPorAno() {
  return db.prepare(`
    SELECT
      exercicio,
      SUM(valor_previsto)  AS valor_total_previsto,
      COUNT(*)             AS n_categorias,
      MIN(coletado_em)     AS coletado_em
    FROM transparencia_receitas
    WHERE codigo_receita GLOB '[0-9].0.0.0.00.0.0'
    GROUP BY exercicio
    ORDER BY exercicio DESC
  `).all();
}

/**
 * Detalhes de receita de um exercício — apenas categorias sintéticas de nível 1 e 2.
 */
function getReceitasDetalheExercicio(exercicio) {
  return db.prepare(`
    SELECT codigo_receita, nome_receita, tipo_conta, valor_previsto
    FROM transparencia_receitas
    WHERE exercicio = ?
      AND (
        -- Nível 1: X.0.0.0.00.0.0
        codigo_receita GLOB '[0-9].0.0.0.00.0.0'
        OR
        -- Nível 2: X.X.0.0.00.0.0
        codigo_receita GLOB '[0-9].[0-9].0.0.00.0.0'
      )
    ORDER BY codigo_receita
  `).all(exercicio);
}

// ---------------------------------------------------------------------------
// Log de coleta
// ---------------------------------------------------------------------------

// Sentinela para "log do ano inteiro" (sem filtro de mês)
const MES_ANO_INTEIRO = -1;

function upsertColetaLog({ tipo, exercicio, mes, registros, novos, atualizados, status, erro }) {
  const mesVal = mes ?? MES_ANO_INTEIRO;
  db.prepare(`
    INSERT INTO transparencia_coletas_log (tipo, exercicio, mes, registros, novos, atualizados, status, erro)
    VALUES (@tipo, @exercicio, @mes, @registros, @novos, @atualizados, @status, @erro)
    ON CONFLICT (tipo, exercicio, mes) DO UPDATE SET
      registros   = excluded.registros,
      novos       = excluded.novos,
      atualizados = excluded.atualizados,
      status      = excluded.status,
      erro        = excluded.erro,
      coletado_em = CURRENT_TIMESTAMP
  `).run({ tipo, exercicio, mes: mesVal, registros, novos, atualizados, status, erro: erro ?? null });
}

function getColetaLog(tipo, exercicio, mes) {
  const mesVal = mes ?? MES_ANO_INTEIRO;
  return db.prepare(
    'SELECT * FROM transparencia_coletas_log WHERE tipo = ? AND exercicio = ? AND mes = ?'
  ).get(tipo, exercicio, mesVal);
}

// ---------------------------------------------------------------------------
// Consultas de suporte ao frontend / API
// ---------------------------------------------------------------------------

function getDespesasPorDocumento(documentoId) {
  return db.prepare(`
    SELECT id, exercicio_orcamento, empenho, tipo,
           data_empenho, data_liquidacao, data_pagamento,
           credor_nome, credor_cnpj, valor,
           historico, licitacao_ref, modalidade
    FROM transparencia_despesas
    WHERE documento_id = ?
    ORDER BY data_empenho ASC
  `).all(documentoId);
}

function getResumoFinanceiroPorDocumento(documentoId) {
  return db.prepare(`
    SELECT
      COUNT(*) as n_empenhos,
      SUM(valor) as valor_empenhado,
      MIN(data_empenho) as primeiro_empenho,
      MAX(data_pagamento) as ultimo_pagamento,
      GROUP_CONCAT(DISTINCT credor_cnpj) as credores_cnpj
    FROM transparencia_despesas
    WHERE documento_id = ?
  `).get(documentoId);
}

function getResumoAnual(exercicio) {
  return db.prepare(`
    SELECT
      COUNT(*) as n_empenhos,
      SUM(valor) as valor_total,
      COUNT(DISTINCT credor_cnpj) as n_credores,
      COUNT(DISTINCT documento_id) as n_licitacoes_vinculadas
    FROM transparencia_despesas
    WHERE exercicio_orcamento = ?
  `).get(exercicio);
}

/**
 * Visão geral para o painel de transparência.
 * `exercicio` (int) ou `exercicios` (int[], p/ mandato) escopam
 * total/topCredores/ultimosEmpenhos/tiposEmpenho; porAno/logs/receitas ficam
 * sempre completos — alimentam o seletor de período.
 */
function getPainelResumo({ exercicio, exercicios } = {}) {
  const lista = (Array.isArray(exercicios) ? exercicios : [exercicio])
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
  const temFiltro = lista.length > 0;
  const placeholders = lista.map(() => '?').join(', ');
  const whereExercicio = temFiltro ? `WHERE exercicio_orcamento IN (${placeholders})` : '';
  const paramsExercicio = lista;

  // valor_total = movimentação (empenhos + ordens de pagamento); valor_empenhado
  // exclui OP — ordem de pagamento é caixa (paga empenho, inclusive restos a
  // pagar de anos anteriores), não nova despesa empenhada. A % de execução da
  // LOA compara previsto × EMPENHADO, senão o numerador infla.
  const porAno = db.prepare(`
    SELECT
      exercicio_orcamento            AS exercicio,
      COUNT(*)                       AS n_empenhos,
      ROUND(SUM(valor), 2)           AS valor_total,
      ROUND(SUM(CASE WHEN tipo NOT LIKE 'OP%' THEN valor ELSE 0 END), 2) AS valor_empenhado,
      COUNT(DISTINCT credor_cnpj)    AS n_credores,
      COUNT(DISTINCT documento_id)   AS n_vinculados,
      COUNT(CASE WHEN documento_id IS NOT NULL THEN 1 END) AS n_empenhos_vinculados,
      MIN(data_empenho)              AS primeiro_empenho,
      MAX(data_empenho)              AS ultimo_empenho
    FROM transparencia_despesas
    GROUP BY exercicio_orcamento
    ORDER BY exercicio_orcamento DESC
  `).all();

  const total = db.prepare(`
    SELECT
      COUNT(*)                       AS n_empenhos,
      ROUND(SUM(valor), 2)           AS valor_total,
      COUNT(DISTINCT credor_cnpj)    AS n_credores,
      COUNT(DISTINCT documento_id)   AS n_licitacoes_vinculadas
    FROM transparencia_despesas
    ${whereExercicio}
  `).get(...paramsExercicio);

  const topCredores = db.prepare(`
    SELECT
      credor_nome,
      credor_cnpj,
      COUNT(*)              AS n_empenhos,
      ROUND(SUM(valor), 2)  AS valor_total,
      MIN(exercicio_orcamento) AS primeiro_exercicio,
      MAX(exercicio_orcamento) AS ultimo_exercicio
    FROM transparencia_despesas
    WHERE credor_cnpj IS NOT NULL AND credor_cnpj != ''
      ${temFiltro ? `AND exercicio_orcamento IN (${placeholders})` : ''}
    GROUP BY credor_cnpj
    ORDER BY valor_total DESC
    LIMIT 20
  `).all(...paramsExercicio);

  const ultimosEmpenhos = db.prepare(`
    SELECT
      td.id, td.exercicio_orcamento, td.empenho, td.tipo,
      td.data_empenho, td.credor_nome, td.credor_cnpj,
      td.valor, td.historico, td.modalidade,
      td.documento_id,
      d.titulo AS documento_titulo, d.numero AS documento_numero
    FROM transparencia_despesas td
    LEFT JOIN documentos d ON d.id = td.documento_id
    WHERE td.data_empenho IS NOT NULL
      ${temFiltro ? `AND td.exercicio_orcamento IN (${placeholders})` : ''}
    ORDER BY td.data_empenho DESC, td.id DESC
    LIMIT 20
  `).all(...paramsExercicio);

  const logs = db.prepare(`
    SELECT exercicio, registros, novos, atualizados, status, erro, coletado_em
    FROM transparencia_coletas_log
    ORDER BY exercicio DESC
  `).all();

  const tiposEmpenho = db.prepare(`
    SELECT tipo, COUNT(*) AS n, ROUND(SUM(valor), 2) AS valor
    FROM transparencia_despesas
    ${whereExercicio}
    GROUP BY tipo
    ORDER BY valor DESC
  `).all(...paramsExercicio);

  // Receitas previstas — cruzar com despesas executadas por exercício
  const receitasPorAno = getReceitasPorAno();
  // Mapear receitas por exercício para lookup rápido
  const receitasMap = new Map(receitasPorAno.map((r) => [r.exercicio, r.valor_total_previsto]));
  // Enriquecer porAno com valor previsto de receita (null se ainda não coletado)
  const porAnoComReceita = porAno.map((row) => ({
    ...row,
    valor_receita_previsto: receitasMap.get(row.exercicio) ?? null,
  }));

  return { total, porAno: porAnoComReceita, topCredores, ultimosEmpenhos, logs, tiposEmpenho, receitasPorAno };
}

/**
 * Lista paginada de despesas com filtros opcionais.
 */
const LIMITE_MAX_DESPESAS = 100;

function getDespesas({
  exercicio,
  credor_cnpj,
  documento_id,
  categoriaPrefixos,
  q,
  pagina = 1,
  limite = 50,
} = {}) {
  const filters = [];
  const params = [];

  if (exercicio) { filters.push('exercicio_orcamento = ?'); params.push(Number(exercicio)); }
  if (credor_cnpj) { filters.push('credor_cnpj = ?'); params.push(credor_cnpj); }
  if (documento_id) { filters.push('documento_id = ?'); params.push(Number(documento_id)); }
  if (categoriaPrefixos?.length) {
    filters.push(`(${categoriaPrefixos.map(() => 'categoria_economica LIKE ?').join(' OR ')})`);
    params.push(...categoriaPrefixos.map((p) => `${p}%`));
  }

  limite = Math.min(Math.max(1, Number(limite) || 50), LIMITE_MAX_DESPESAS);
  const offset = (Math.max(1, pagina) - 1) * limite;

  const executar = (filtersFinais, paramsFinais) => {
    const where = filtersFinais.length ? `WHERE ${filtersFinais.join(' AND ')}` : '';
    const total = db.prepare(`SELECT COUNT(*) AS n FROM transparencia_despesas td ${where}`).get(...paramsFinais).n;
    const dados = db.prepare(`
      SELECT
        td.id, td.exercicio_orcamento, td.empenho, td.tipo,
        td.data_empenho, td.data_liquidacao, td.data_pagamento,
        td.credor_nome, td.credor_cnpj, td.valor,
        td.funcao, td.unidade, td.programa, td.categoria_economica, td.fonte_recurso,
        td.historico, td.modalidade, td.licitacao_ref,
        td.documento_id,
        d.titulo AS documento_titulo, d.numero AS documento_numero
      FROM transparencia_despesas td
      LEFT JOIN documentos d ON d.id = td.documento_id
      ${where}
      ORDER BY td.data_empenho DESC, td.id DESC
      LIMIT ? OFFSET ?
    `).all(...paramsFinais, limite, offset);
    return { total, pagina: Number(pagina), limite, dados };
  };

  const ftsQuery = q ? sanitizeFtsQuery(q) : null;
  if (ftsQuery) {
    try {
      return executar(
        [...filters, 'td.id IN (SELECT rowid FROM despesas_fts WHERE despesas_fts MATCH ?)'],
        [...params, ftsQuery]
      );
    } catch {
      // Sintaxe FTS inválida — fallback LIKE em historico/credor
      const like = `%${String(q).slice(0, 100)}%`;
      return executar(
        [...filters, '(td.historico LIKE ? OR td.credor_nome LIKE ?)'],
        [...params, like, like]
      );
    }
  }

  return executar(filters, params);
}

module.exports = {
  upsertDespesa,
  upsertReceita,
  crosswalkDespesasDocumentos,
  enriquecerDetalhesComEmpenhos,
  upsertColetaLog,
  getColetaLog,
  getDespesasPorDocumento,
  getResumoFinanceiroPorDocumento,
  getResumoAnual,
  getPainelResumo,
  getDespesas,
  getReceitasPorAno,
  getReceitasDetalheExercicio,
};
