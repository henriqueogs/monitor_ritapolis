const config = require('../config');
const { deepRepairStrings, normalizeText } = require('../utils/text');
const { parseLicitacaoDetalhes } = require('../parsers/licitacao-detalhes');
const { parseProdutosLicitados } = require('../parsers/licitacao-produtos');
const { parseResultadosItensLicitacao } = require('../parsers/licitacao-resultados-itens');
const { agruparDocumentosLicitacao, papelLabel } = require('../licitacoes/grupos');
const { normalizarNumeroDocumento, titulosCompativeis } = require('../licitacoes/processo');
const { normalizarCnpj, formatarCnpj } = require('../licitacoes/cnpj');

// Fase E: importa db do singleton para evitar conexões duplicadas
const { db } = require('./connection');

// Fase E: importa repos especializados para re-export de compatibilidade
const coletasRepo = require('./coletas-repo');
const aiJobsRepo = require('./ai-jobs-repo');
const documentosRepo = require('./documentos-repo');

// Desestrutura helpers do documentos-repo para uso nas funções restantes
const {
  parseJson,
  serializeJson,
  likeParam,
  buildTextoHash,
  buildJsonHash,
  labelFonte,
  labelTipo,
  labelStatus,
  buildQualidadeAlertas: _buildQualidadeAlertas,
  buildDocumentoIndicadores,
  buildOrigemResumo,
  normalizeDocumento,
  cleanField,
  compactField,
  normalizeCampoKey,
  getCampo,
  isUsableUrl,
  classifyAnexo,
  normalizeModalidadeLicitacao,
  listDocumentos,
  listAnosDocumentos,
} = documentosRepo;

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.length) {return;}
  if (columns.some((item) => item.name === column)) {return;}
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

function ensureRuntimeSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS documentos_anexos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      documento_id INTEGER NOT NULL REFERENCES documentos(id) ON DELETE CASCADE,
      nome TEXT,
      tipo TEXT,
      file_id TEXT,
      url TEXT NOT NULL,
      datahora TEXT,
      texto_completo TEXT,
      texto_hash TEXT,
      status_extracao TEXT DEFAULT 'pendente',
      erro TEXT,
      parser TEXT,
      paginas INTEGER,
      coletado_em TEXT DEFAULT CURRENT_TIMESTAMP,
      atualizado_em TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (documento_id, url)
    );
  `);
  ensureColumn('licitacoes_detalhes', 'origem', 'TEXT');
  ensureColumn('licitacoes_detalhes', 'origem_detalhe', 'TEXT');
  ensureColumn('licitacoes_detalhes', 'trecho_fonte', 'TEXT');
  ensureColumn('licitacoes_detalhes', 'confianca', 'REAL');
  ensureColumn('licitacoes_detalhes', 'atualizado_em', 'TEXT');
  ensureColumn('licitacoes_produtos', 'valor_final_tipo', 'TEXT');
  ensureColumn('licitacoes_produtos', 'valor_lote_final', 'REAL');
  ensureColumn('licitacoes_produtos', 'valor_global_final', 'REAL');
  ensureColumn('fornecedores_perfil', 'total_valor_pago', 'REAL NOT NULL DEFAULT 0');
  ensureColumn('fornecedores_perfil', 'n_empenhos', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('fornecedores_perfil', 'n_anos_pago', 'INTEGER NOT NULL DEFAULT 0');
  db.exec(`
    CREATE TABLE IF NOT EXISTS produtos_grupos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rotulo_canonico TEXT NOT NULL,
      n_itens INTEGER NOT NULL DEFAULT 0,
      n_variacoes INTEGER NOT NULL DEFAULT 0,
      metodo TEXT NOT NULL DEFAULT 'embeddings',
      criado_em TEXT DEFAULT CURRENT_TIMESTAMP,
      atualizado_em TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
  ensureColumn('licitacoes_produtos', 'grupo_id', 'INTEGER REFERENCES produtos_grupos(id) ON DELETE SET NULL');
  db.exec('CREATE INDEX IF NOT EXISTS idx_licitacoes_produtos_grupo_id ON licitacoes_produtos(grupo_id);');
  db.exec(`
    CREATE TABLE IF NOT EXISTS licitacoes_fontes_relacionadas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      documento_id INTEGER NOT NULL REFERENCES documentos(id) ON DELETE CASCADE,
      fonte TEXT NOT NULL,
      sistema_origem TEXT,
      identificador TEXT NOT NULL,
      url TEXT,
      status_correspondencia TEXT NOT NULL DEFAULT 'sugerida',
      score REAL,
      payload_json TEXT,
      coletado_em TEXT DEFAULT CURRENT_TIMESTAMP,
      atualizado_em TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (documento_id, fonte, identificador)
    );
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_documentos_anexos_documento_id ON documentos_anexos(documento_id);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_documentos_anexos_tipo ON documentos_anexos(tipo);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_documentos_anexos_status ON documentos_anexos(status_extracao);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_licitacoes_detalhes_origem ON licitacoes_detalhes(origem);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_licitacoes_fontes_relacionadas_documento_id ON licitacoes_fontes_relacionadas(documento_id);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_licitacoes_fontes_relacionadas_fonte ON licitacoes_fontes_relacionadas(fonte);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_licitacoes_fontes_relacionadas_status ON licitacoes_fontes_relacionadas(status_correspondencia);');
  db.exec(`
    CREATE TABLE IF NOT EXISTS licitacoes_grupos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      processo_chave TEXT NOT NULL,
      ano INTEGER NOT NULL,
      processo_exibicao TEXT,
      titulo_resumo TEXT,
      documento_canonico_id INTEGER REFERENCES documentos(id) ON DELETE SET NULL,
      total_documentos INTEGER NOT NULL DEFAULT 0,
      criado_em TEXT DEFAULT CURRENT_TIMESTAMP,
      atualizado_em TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (processo_chave, ano)
    );
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS licitacoes_grupo_documentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      grupo_id INTEGER NOT NULL REFERENCES licitacoes_grupos(id) ON DELETE CASCADE,
      documento_id INTEGER NOT NULL REFERENCES documentos(id) ON DELETE CASCADE,
      papel TEXT NOT NULL DEFAULT 'publicacao',
      confianca REAL DEFAULT 1,
      criado_em TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (grupo_id, documento_id)
    );
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_licitacoes_grupos_ano ON licitacoes_grupos(ano);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_licitacoes_grupos_processo ON licitacoes_grupos(processo_chave);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_licitacoes_grupo_documentos_grupo_id ON licitacoes_grupo_documentos(grupo_id);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_licitacoes_grupo_documentos_documento_id ON licitacoes_grupo_documentos(documento_id);');
  db.exec(`
    CREATE TABLE IF NOT EXISTS fornecedores_perfil (
      cnpj TEXT PRIMARY KEY,
      nome_canonico TEXT,
      total_valor_produtos REAL NOT NULL DEFAULT 0,
      total_valor_vencedor REAL NOT NULL DEFAULT 0,
      n_itens_produtos INTEGER NOT NULL DEFAULT 0,
      n_vitorias INTEGER NOT NULL DEFAULT 0,
      n_licitacoes_produtos INTEGER NOT NULL DEFAULT 0,
      n_licitacoes_vencedor INTEGER NOT NULL DEFAULT 0,
      anos_ativos TEXT,
      atualizado_em TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS licitacoes_categorias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      documento_id INTEGER NOT NULL REFERENCES documentos(id) ON DELETE CASCADE,
      categoria TEXT NOT NULL,
      subcategoria TEXT,
      confianca REAL NOT NULL DEFAULT 0,
      origem TEXT NOT NULL DEFAULT 'keyword',
      keywords_matched TEXT,
      criado_em TEXT DEFAULT CURRENT_TIMESTAMP,
      atualizado_em TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (documento_id)
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_licitacoes_categorias_documento ON licitacoes_categorias(documento_id);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_licitacoes_categorias_categoria ON licitacoes_categorias(categoria);');
}

ensureRuntimeSchema();

// parseJson, serializeJson, likeParam, buildTextoHash, buildJsonHash,
// labelFonte, labelTipo, labelStatus, buildQualidadeAlertas, buildDocumentoIndicadores,
// buildOrigemResumo, decorateDocumento, normalizeDocumento, cleanField, compactField,
// normalizeCampoKey, getCampo, isUsableUrl, classifyAnexo, normalizeModalidadeLicitacao
// → movidos para documentos-repo.js

function buildLicitacaoModelo(documento, detalhes = {}) {
  const dados = documento?.dados_extras || {};
  const campos = dados.campos || {};
  const licitacaoExtra = dados.licitacao || {};
  const anexos = Array.isArray(dados.anexos) ? dados.anexos : [];
  const anexoTipos = [...new Set(anexos.map((anexo) => classifyAnexo(anexo.nome)))];
  const objetoCadastro = getCampo(campos, ['objeto']);
  const objetoExtraido = compactField(licitacaoExtra.objeto);
  const modalidade =
    getCampo(campos, ['modalidade']) ||
    cleanField(detalhes?.modalidade) ||
    cleanField(licitacaoExtra.modalidade);

  return {
    processo: getCampo(campos, ['processo']) || cleanField(documento?.numero) || cleanField(licitacaoExtra.numero_processo),
    modalidade,
    modalidade_nome: normalizeModalidadeLicitacao(modalidade),
    objeto: compactField(objetoCadastro || objetoExtraido || documento?.resumo || documento?.titulo),
    objeto_origem: objetoCadastro ? 'cadastro_oficial' : objetoExtraido ? 'texto_extraido' : 'resumo',
    data_sessao: cleanField(documento?.data_abertura) || cleanField(licitacaoExtra.data_abertura) || getCampo(campos, ['data']),
    valor_estimado: documento?.valor_estimado ?? licitacaoExtra.valor_estimado ?? null,
    link_processo: isUsableUrl(getCampo(campos, ['link do processo', 'link'])),
    anexos_total: anexos.length,
    anexos_tipos: anexoTipos,
    tem_edital: anexoTipos.includes('edital'),
    tem_ata: anexoTipos.includes('ata'),
    tem_contrato: anexoTipos.includes('contrato'),
    tem_proposta: anexoTipos.includes('proposta'),
    tem_recurso: anexoTipos.includes('recurso')
  };
}

function parseNumericField(value) {
  if (value === null || value === '') {return null;}
  if (typeof value === 'number') {return Number.isFinite(value) ? value : null;}

  const text = String(value)
    .replace(/[^\d,.-]/g, '')
    .trim();

  if (!text) {return null;}

  const normalized = text.includes(',')
    ? text.replace(/\./g, '').replace(',', '.')
    : text;
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : null;
}

function parsePositiveNumericField(value) {
  const parsed = parseNumericField(value);
  return parsed && parsed > 0 ? parsed : null;
}

const VALOR_FINAL_TIPOS = new Set(['unitario', 'total_item', 'lote', 'global', 'indefinido']);

function normalizeValorFinalTipo(value) {
  const text = normalizeCampoKey(value).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (!text) {return null;}
  if (text === 'total' || text === 'total_final' || text === 'item_total') {return 'total_item';}
  if (text === 'valor_lote' || text === 'lote_final') {return 'lote';}
  if (text === 'valor_global' || text === 'global_final') {return 'global';}
  return VALOR_FINAL_TIPOS.has(text) ? text : null;
}

function hasFinalValue(produto) {
  return (
    produto.valor_unitario_final !== null ||
    produto.valor_total_final !== null ||
    produto.valor_lote_final !== null ||
    produto.valor_global_final !== null
  );
}

function normalizeProdutoDescricao(value) {
  const text = cleanField(value);
  if (!text) {return null;}

  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildProdutoHash(produto) {
  const identity =
    produto.item_numero || produto.lote_numero
      ? [
          produto.documento_id,
          produto.lote_numero || '',
          produto.item_numero || ''
        ].join('|')
      : [
          produto.documento_id,
          produto.descricao_normalizada || produto.descricao
        ].join('|');

  return crypto
    .createHash('sha256')
    .update(identity, 'utf8')
    .digest('hex');
}

function produtoCompletenessScore(produto) {
  return [
    produto.descricao ? Math.min(produto.descricao.length, 500) : 0,
    produto.trecho_fonte ? Math.min(produto.trecho_fonte.length, 500) : 0,
    produto.quantidade !== null ? 80 : 0,
    produto.unidade ? 40 : 0,
    produto.valor_unitario_estimado !== null || produto.valor_total_estimado !== null ? 80 : 0,
    hasFinalValue(produto) ? 80 : 0,
    produto.fornecedor_nome ? 40 : 0
  ].reduce((sum, value) => sum + value, 0);
}

function dedupeProdutosLicitados(produtos) {
  const byIdentity = new Map();

  produtos.forEach((produto) => {
    const key =
      produto.item_numero || produto.lote_numero
        ? `${produto.documento_id}|${produto.lote_numero || ''}|${produto.item_numero || ''}`
        : `${produto.documento_id}|${produto.descricao_normalizada || produto.descricao}`;
    const current = byIdentity.get(key);

    if (!current || produtoCompletenessScore(produto) > produtoCompletenessScore(current)) {
      byIdentity.set(key, produto);
    }
  });

  return Array.from(byIdentity.values());
}

function clearProdutosExtraidosNaoValidados(documentoId) {
  return db
    .prepare(
      `DELETE FROM licitacoes_produtos
       WHERE documento_id = ?
         AND origem IN ('ia_resumo', 'texto_tabela')
         AND status_revisao <> 'validado'`
    )
    .run(documentoId).changes || 0;
}

function normalizeProdutoLicitadoFromAi(item, contexto) {
  const descricao = compactField(item?.descricao, 900);
  const trechoFonte = compactField(item?.trecho_fonte, 900);

  if (!descricao || !trechoFonte) {return null;}

  const hasPriceEvidence = /R\$|\b(valor|preco|preço|estimad[oa]?|unit[aá]ri[oa]?|total|global|final|contratad[oa]?|homologad[oa]?)\b/i.test(
    `${trechoFonte} ${descricao}`
  );
  const valorUnitarioFinal = hasPriceEvidence ? parsePositiveNumericField(item?.valor_unitario_final) : null;
  const valorTotalFinal = hasPriceEvidence ? parsePositiveNumericField(item?.valor_total_final) : null;
  const valorLoteFinal = hasPriceEvidence ? parsePositiveNumericField(item?.valor_lote_final) : null;
  const valorGlobalFinal = hasPriceEvidence ? parsePositiveNumericField(item?.valor_global_final) : null;
  const valorFinalTipo =
    normalizeValorFinalTipo(item?.valor_final_tipo) ||
    (valorGlobalFinal !== null
      ? 'global'
      : valorLoteFinal !== null
        ? 'lote'
        : valorTotalFinal !== null
          ? 'total_item'
          : valorUnitarioFinal !== null
            ? 'unitario'
            : null);

  const produto = {
    documento_id: contexto.documento.id,
    ano: contexto.documento.ano || null,
    processo: contexto.modelo.processo || contexto.documento.numero || null,
    modalidade: contexto.modelo.modalidade_nome || contexto.modelo.modalidade || null,
    item_numero: cleanField(item?.item_numero),
    lote_numero: cleanField(item?.lote_numero),
    descricao,
    descricao_normalizada: normalizeProdutoDescricao(descricao),
    unidade: cleanField(item?.unidade),
    quantidade: parsePositiveNumericField(item?.quantidade),
    valor_unitario_estimado: hasPriceEvidence ? parsePositiveNumericField(item?.valor_unitario_estimado) : null,
    valor_total_estimado: hasPriceEvidence ? parsePositiveNumericField(item?.valor_total_estimado) : null,
    valor_unitario_final: valorFinalTipo === 'global' || valorFinalTipo === 'lote' ? null : valorUnitarioFinal,
    valor_total_final: valorFinalTipo === 'global' || valorFinalTipo === 'lote' ? null : valorTotalFinal,
    valor_final_tipo: valorFinalTipo,
    valor_lote_final: valorFinalTipo === 'lote' ? valorLoteFinal || valorTotalFinal || valorUnitarioFinal : null,
    valor_global_final: valorFinalTipo === 'global' ? valorGlobalFinal || valorTotalFinal || valorUnitarioFinal : null,
    fornecedor_nome: cleanField(item?.fornecedor_nome),
    fornecedor_cnpj: cleanField(item?.fornecedor_cnpj),
    origem: 'ia_resumo',
    origem_detalhe: `documentos_resumos_ai:${contexto.resumoAiId}`,
    trecho_fonte: trechoFonte,
    resumo_ai_id: contexto.resumoAiId,
    confianca: parseNumericField(contexto.confianca),
    status_revisao: 'pendente'
  };

  produto.hash_item = buildProdutoHash(produto);
  return produto;
}

function normalizeProdutoLicitadoFromTabela(item, contexto) {
  const descricao = compactField(item?.descricao, 900);
  const trechoFonte = compactField(item?.trecho_fonte, 900);

  if (!descricao || !trechoFonte) {return null;}

  const produto = {
    documento_id: contexto.documento.id,
    ano: contexto.documento.ano || null,
    processo: contexto.modelo.processo || contexto.documento.numero || null,
    modalidade: contexto.modelo.modalidade_nome || contexto.modelo.modalidade || null,
    item_numero: cleanField(item?.item_numero),
    lote_numero: cleanField(item?.lote_numero),
    descricao,
    descricao_normalizada: normalizeProdutoDescricao(descricao),
    unidade: cleanField(item?.unidade),
    quantidade: parsePositiveNumericField(item?.quantidade),
    valor_unitario_estimado: null,
    valor_total_estimado: null,
    valor_unitario_final: null,
    valor_total_final: null,
    valor_final_tipo: null,
    valor_lote_final: null,
    valor_global_final: null,
    fornecedor_nome: null,
    fornecedor_cnpj: null,
    origem: 'texto_tabela',
    origem_detalhe: cleanField(item?.origem_detalhe) || 'texto_completo:tabela_itens',
    trecho_fonte: trechoFonte,
    resumo_ai_id: null,
    confianca: parseNumericField(item?.confianca) ?? 0.86,
    status_revisao: 'pendente'
  };

  produto.hash_item = buildProdutoHash(produto);
  return produto;
}

function normalizeProdutoRow(row) {
  if (!row) {return null;}

  return {
    ...Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        typeof value === 'string' ? normalizeText(value) : value
      ])
    ),
    validacao_status: row.validacao_status || (row.validacoes_total ? 'revisar' : 'pendente'),
    validacoes_total: Number(row.validacoes_total || 0)
  };
}

function upsertLicitacaoProdutoValidacao({
  produto_id,
  fonte,
  sistema_origem,
  valor_encontrado,
  campo_validado,
  status,
  divergencia_abs,
  divergencia_pct,
  payload_json
}) {
  const payload = {
    produto_id: Number(produto_id),
    fonte: cleanField(fonte) || 'consistencia_interna',
    sistema_origem: cleanField(sistema_origem) || 'monitor_ritapolis',
    valor_encontrado: parsePositiveNumericField(valor_encontrado),
    campo_validado: cleanField(campo_validado) || 'valor_final',
    status: cleanField(status) || 'pendente',
    divergencia_abs: parseNumericField(divergencia_abs),
    divergencia_pct: parseNumericField(divergencia_pct),
    payload_json: serializeJson(payload_json || {}),
    validado_em: new Date().toISOString()
  };

  db.prepare(
    `DELETE FROM licitacoes_produtos_validacoes
     WHERE produto_id = @produto_id
       AND fonte = @fonte
       AND IFNULL(sistema_origem, '') = IFNULL(@sistema_origem, '')
       AND campo_validado = @campo_validado`
  ).run({
    produto_id: payload.produto_id,
    fonte: payload.fonte,
    sistema_origem: payload.sistema_origem,
    campo_validado: payload.campo_validado
  });

  return db.prepare(
    `INSERT INTO licitacoes_produtos_validacoes (
      produto_id, fonte, sistema_origem, valor_encontrado, campo_validado,
      status, divergencia_abs, divergencia_pct, payload_json, validado_em
    ) VALUES (
      @produto_id, @fonte, @sistema_origem, @valor_encontrado, @campo_validado,
      @status, @divergencia_abs, @divergencia_pct, @payload_json, @validado_em
    )`
  ).run(payload).changes || 0;
}

function normalizeLicitacaoPncpCandidate(row) {
  if (!row) {return null;}
  const documento = normalizeDocumento(row);
  const modelo = buildLicitacaoModelo(documento, row);

  return {
    id: documento.id,
    documento_id: documento.id,
    fonte: documento.fonte,
    tipo: documento.tipo,
    numero: documento.numero,
    ano: documento.ano,
    titulo: documento.titulo,
    resumo: documento.resumo,
    data_publicacao: documento.data_publicacao,
    data_abertura: documento.data_abertura,
    valor_estimado: documento.valor_estimado,
    url_origem: documento.url_origem,
    url_pdf: documento.url_pdf,
    licitacao_detalhes: {
      modalidade: row.modalidade || null,
      status: row.status || null,
      vencedor_nome: row.vencedor_nome || null,
      vencedor_cnpj: row.vencedor_cnpj || null,
      valor_final: row.valor_final ?? null,
      numero_pncp: row.numero_pncp || null,
      data_homologacao: row.data_homologacao || null,
      origem: row.origem || null,
      origem_detalhe: row.origem_detalhe || null
    },
    licitacao_modelo: modelo
  };
}

function listLicitacoesParaDiagnosticoPncp({
  ano = new Date().getFullYear(),
  documentoId,
  limite = 20
} = {}) {
  const filters = ["d.tipo = 'edital'"];
  const params = {};

  if (ano) {
    filters.push('d.ano = @ano');
    params.ano = Number(ano);
  }

  if (documentoId) {
    filters.push('d.id = @documentoId');
    params.documentoId = Number(documentoId);
  }

  const limitValue = Number(limite);
  const limitClause = Number.isFinite(limitValue) && limitValue > 0 ? 'LIMIT @limite' : '';
  if (limitClause) {params.limite = limitValue;}

  return db
    .prepare(
      `SELECT d.id, d.fonte, d.tipo, d.numero, d.ano, d.titulo, d.resumo,
              d.data_publicacao, d.data_abertura, d.valor_estimado,
              d.url_origem, d.url_pdf, d.dados_extras,
              d.coletado_em, d.atualizado_em,
              ld.modalidade, ld.status, ld.vencedor_nome, ld.vencedor_cnpj,
              ld.valor_final, ld.numero_pncp, ld.data_homologacao,
              ld.origem, ld.origem_detalhe
       FROM documentos d
       LEFT JOIN licitacoes_detalhes ld ON ld.documento_id = d.id
       WHERE ${filters.join(' AND ')}
       ORDER BY COALESCE(d.data_publicacao, d.data_abertura, d.atualizado_em) DESC, d.id DESC
       ${limitClause}`
    )
    .all(params)
    .map(normalizeLicitacaoPncpCandidate);
}

function upsertLicitacaoFonteRelacionada({
  documento_id,
  fonte,
  sistema_origem,
  identificador,
  url,
  status_correspondencia,
  score,
  payload_json
}) {
  const payload = {
    documento_id: Number(documento_id),
    fonte: cleanField(fonte) || 'pncp',
    sistema_origem: cleanField(sistema_origem) || 'pncp_consulta',
    identificador: cleanField(identificador),
    url: cleanField(url),
    status_correspondencia: cleanField(status_correspondencia) || 'sugerida',
    score: parseNumericField(score),
    payload_json: serializeJson(payload_json || {}),
    coletado_em: new Date().toISOString(),
    atualizado_em: new Date().toISOString()
  };

  if (!payload.documento_id || !payload.identificador) {return 0;}

  return db
    .prepare(
      `INSERT INTO licitacoes_fontes_relacionadas (
        documento_id, fonte, sistema_origem, identificador, url,
        status_correspondencia, score, payload_json, coletado_em, atualizado_em
      ) VALUES (
        @documento_id, @fonte, @sistema_origem, @identificador, @url,
        @status_correspondencia, @score, @payload_json, @coletado_em, @atualizado_em
      )
      ON CONFLICT(documento_id, fonte, identificador) DO UPDATE SET
        sistema_origem = excluded.sistema_origem,
        url = COALESCE(excluded.url, licitacoes_fontes_relacionadas.url),
        status_correspondencia = excluded.status_correspondencia,
        score = excluded.score,
        payload_json = excluded.payload_json,
        atualizado_em = excluded.atualizado_em`
    )
    .run(payload).changes || 0;
}

const LICITACAO_FONTE_STATUS = new Set([
  'forte',
  'sugerida',
  'fraca',
  'baixa_confianca',
  'confirmada',
  'rejeitada',
  'revisar'
]);

function normalizeLicitacaoFonteRelacionada(row) {
  if (!row) {return null;}
  const payload = deepRepairStrings(parseJson(row.payload_json)) || {};

  return {
    ...Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        typeof value === 'string' ? normalizeText(value) : value
      ])
    ),
    payload_json: payload,
    candidato_resumo: payload.candidato_resumo || null,
    consulta: payload.consulta || null,
    correlacao: payload.correlacao || null,
    estrategia_busca: payload.diagnostico?.estrategia || null
  };
}

function listLicitacaoFontesRelacionadasByDocumentoId(documentoId) {
  return db
    .prepare(
      `SELECT *
       FROM licitacoes_fontes_relacionadas
       WHERE documento_id = ?
       ORDER BY score DESC, datetime(atualizado_em) DESC, id DESC`
    )
    .all(Number(documentoId))
    .map(normalizeLicitacaoFonteRelacionada);
}

function listLicitacaoFontesRelacionadas({
  ano = new Date().getFullYear(),
  status,
  fonte,
  pagina = 1,
  limite = 20
} = {}) {
  const filters = [];
  const params = {
    limite: Math.min(Math.max(Number(limite || 20), 1), 100),
    offset: (Math.max(Number(pagina || 1), 1) - 1) * Math.min(Math.max(Number(limite || 20), 1), 100)
  };

  if (ano) {
    filters.push('d.ano = @ano');
    params.ano = Number(ano);
  }

  if (status) {
    filters.push('lfr.status_correspondencia = @status');
    params.status = cleanField(status);
  }

  if (fonte) {
    filters.push('lfr.fonte = @fonte');
    params.fonte = cleanField(fonte);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const total = db
    .prepare(
      `SELECT COUNT(*) AS total
       FROM licitacoes_fontes_relacionadas lfr
       JOIN documentos d ON d.id = lfr.documento_id
       ${whereClause}`
    )
    .get(params).total;

  const rows = db
    .prepare(
      `SELECT lfr.*,
              d.numero AS documento_numero,
              d.ano AS documento_ano,
              d.titulo AS documento_titulo,
              d.fonte AS documento_fonte
       FROM licitacoes_fontes_relacionadas lfr
       JOIN documentos d ON d.id = lfr.documento_id
       ${whereClause}
       ORDER BY lfr.score DESC, datetime(lfr.atualizado_em) DESC, lfr.id DESC
       LIMIT @limite OFFSET @offset`
    )
    .all(params)
    .map(normalizeLicitacaoFonteRelacionada);

  return {
    total,
    pagina: Math.max(Number(pagina || 1), 1),
    limite: params.limite,
    dados: rows
  };
}

function updateLicitacaoFonteRelacionadaStatus(id, status) {
  const normalizedStatus = cleanField(status);
  if (!LICITACAO_FONTE_STATUS.has(normalizedStatus)) {
    throw new Error('Status de correspondencia invalido');
  }

  const now = new Date().toISOString();
  const result = db
    .prepare(
      `UPDATE licitacoes_fontes_relacionadas
       SET status_correspondencia = @status,
           atualizado_em = @atualizado_em
       WHERE id = @id`
    )
    .run({
      id: Number(id),
      status: normalizedStatus,
      atualizado_em: now
    });

  if (!result.changes) {return null;}

  return normalizeLicitacaoFonteRelacionada(
    db.prepare('SELECT * FROM licitacoes_fontes_relacionadas WHERE id = ?').get(Number(id))
  );
}

function listDocumentosEditalParaGrupos({ ano } = {}) {
  const filters = ["d.tipo = 'edital'"];
  const params = {};

  if (ano) {
    filters.push('d.ano = @ano');
    params.ano = Number(ano);
  }

  const rows = db
    .prepare(
      `SELECT d.*,
              ld.modalidade, ld.status, ld.vencedor_nome, ld.vencedor_cnpj,
              ld.valor_final, ld.numero_pncp, ld.data_homologacao
       FROM documentos d
       LEFT JOIN licitacoes_detalhes ld ON ld.documento_id = d.id
       WHERE ${filters.join(' AND ')}
       ORDER BY d.ano DESC, d.data_publicacao DESC, d.id DESC`
    )
    .all(params)
    .map((row) => {
      const documento = normalizeDocumento(row);
      const detalhes = {
        modalidade: row.modalidade,
        status: row.status,
        vencedor_nome: row.vencedor_nome,
        vencedor_cnpj: row.vencedor_cnpj,
        valor_final: row.valor_final,
        numero_pncp: row.numero_pncp,
        data_homologacao: row.data_homologacao
      };

      return {
        documento,
        modelo: buildLicitacaoModelo(documento, detalhes)
      };
    });

  return rows;
}

function syncLicitacoesGrupos({ ano } = {}) {
  const itens = listDocumentosEditalParaGrupos({ ano });
  const grupos = agruparDocumentosLicitacao(itens);
  const now = new Date().toISOString();

  const upsertGrupo = db.prepare(
    `INSERT INTO licitacoes_grupos (
      processo_chave, ano, processo_exibicao, titulo_resumo,
      documento_canonico_id, total_documentos, criado_em, atualizado_em
    ) VALUES (
      @processo_chave, @ano, @processo_exibicao, @titulo_resumo,
      @documento_canonico_id, @total_documentos, @criado_em, @atualizado_em
    )
    ON CONFLICT(processo_chave, ano) DO UPDATE SET
      processo_exibicao = excluded.processo_exibicao,
      titulo_resumo = excluded.titulo_resumo,
      documento_canonico_id = excluded.documento_canonico_id,
      total_documentos = excluded.total_documentos,
      atualizado_em = excluded.atualizado_em`
  );

  const deleteMembros = db.prepare('DELETE FROM licitacoes_grupo_documentos WHERE grupo_id = ?');
  const insertMembro = db.prepare(
    `INSERT INTO licitacoes_grupo_documentos (grupo_id, documento_id, papel, confianca)
     VALUES (@grupo_id, @documento_id, @papel, @confianca)
     ON CONFLICT(grupo_id, documento_id) DO UPDATE SET
       papel = excluded.papel,
       confianca = excluded.confianca`
  );

  let gruposSalvos = 0;
  let documentosVinculados = 0;
  let gruposMultiplos = 0;

  grupos.forEach((grupo) => {
    upsertGrupo.run({
      processo_chave: grupo.processo_chave,
      ano: grupo.ano,
      processo_exibicao: grupo.processo_exibicao,
      titulo_resumo: grupo.titulo_resumo,
      documento_canonico_id: grupo.documento_canonico_id,
      total_documentos: grupo.total_documentos,
      criado_em: now,
      atualizado_em: now
    });

    const registro = db
      .prepare('SELECT id FROM licitacoes_grupos WHERE processo_chave = ? AND ano = ?')
      .get(grupo.processo_chave, grupo.ano);

    if (!registro) {return;}

    gruposSalvos += 1;
    if (grupo.total_documentos > 1) {gruposMultiplos += 1;}

    deleteMembros.run(registro.id);
    grupo.documentos.forEach((doc) => {
      insertMembro.run({
        grupo_id: registro.id,
        documento_id: doc.documento_id,
        papel: doc.papel,
        confianca: 1
      });
      documentosVinculados += 1;
    });
  });

  return {
    filtros: { ano: ano ? Number(ano) : null },
    documentos_avaliados: itens.length,
    grupos_processados: grupos.length,
    grupos_salvos: gruposSalvos,
    grupos_multiplos: gruposMultiplos,
    documentos_vinculados: documentosVinculados
  };
}

function getLicitacaoGrupoByDocumentoId(documentoId) {
  const membro = db
    .prepare(
      `SELECT lgd.grupo_id, lgd.papel, lgd.confianca
       FROM licitacoes_grupo_documentos lgd
       WHERE lgd.documento_id = ?`
    )
    .get(Number(documentoId));

  if (!membro) {return null;}

  const grupo = db
    .prepare('SELECT * FROM licitacoes_grupos WHERE id = ?')
    .get(membro.grupo_id);

  if (!grupo) {return null;}

  const documentos = db
    .prepare(
      `SELECT lgd.documento_id, lgd.papel, lgd.confianca,
              d.titulo, d.numero, d.ano, d.data_publicacao, d.fonte, d.url_pdf, d.status_coleta
       FROM licitacoes_grupo_documentos lgd
       JOIN documentos d ON d.id = lgd.documento_id
       WHERE lgd.grupo_id = ?
       ORDER BY
         CASE lgd.papel
           WHEN 'edital' THEN 0
           WHEN 'publicacao' THEN 1
           WHEN 'homologacao' THEN 2
           WHEN 'ata' THEN 3
           WHEN 'contrato' THEN 4
           WHEN 'republicacao' THEN 5
           ELSE 6
         END,
         datetime(d.data_publicacao) ASC,
         d.id ASC`
    )
    .all(grupo.id)
    .map((row) => ({
      documento_id: row.documento_id,
      papel: row.papel,
      papel_nome: papelLabel(row.papel),
      confianca: row.confianca,
      titulo: row.titulo,
      numero: row.numero,
      ano: row.ano,
      data_publicacao: row.data_publicacao,
      fonte: row.fonte,
      fonte_nome: labelFonte(row.fonte),
      url_pdf: row.url_pdf,
      status_coleta: row.status_coleta,
      eh_atual: row.documento_id === Number(documentoId),
      eh_canonico: row.documento_id === grupo.documento_canonico_id
    }));

  return {
    id: grupo.id,
    processo_chave: grupo.processo_chave,
    processo_exibicao: grupo.processo_exibicao,
    ano: grupo.ano,
    titulo_resumo: grupo.titulo_resumo,
    documento_canonico_id: grupo.documento_canonico_id,
    total_documentos: grupo.total_documentos,
    papel_atual: membro.papel,
    papel_atual_nome: papelLabel(membro.papel),
    documentos
  };
}

function compactProdutoParaLeituraIntegrada(produto) {
  return {
    id: produto.id,
    item_numero: produto.item_numero || null,
    lote_numero: produto.lote_numero || null,
    descricao: compactField(produto.descricao, 360),
    unidade: produto.unidade || null,
    quantidade: produto.quantidade ?? null,
    valor_unitario_estimado: produto.valor_unitario_estimado ?? null,
    valor_total_estimado: produto.valor_total_estimado ?? null,
    valor_unitario_final: produto.valor_unitario_final ?? null,
    valor_total_final: produto.valor_total_final ?? null,
    valor_final_tipo: produto.valor_final_tipo || null,
    valor_lote_final: produto.valor_lote_final ?? null,
    valor_global_final: produto.valor_global_final ?? null,
    fornecedor_nome: produto.fornecedor_nome || null,
    fornecedor_cnpj: produto.fornecedor_cnpj || null,
    origem: produto.origem || null,
    validacao_status: produto.validacao_status || null,
    trecho_fonte: compactField(produto.trecho_fonte, 320)
  };
}

function buildProdutoAmostrasParaLeituraIntegrada(produtos) {
  const fornecedores = [];
  const fornecedorKeys = new Set();
  const produtosComPrecoFinal = [];

  produtos.forEach((produto) => {
    if (
      produto.fornecedor_nome &&
      !fornecedorKeys.has(`${produto.fornecedor_nome}|${produto.fornecedor_cnpj || ''}`)
    ) {
      fornecedorKeys.add(`${produto.fornecedor_nome}|${produto.fornecedor_cnpj || ''}`);
      fornecedores.push({
        nome: produto.fornecedor_nome,
        cnpj: produto.fornecedor_cnpj || null
      });
    }

    if (
      produtosComPrecoFinal.length < 12 &&
      (
        produto.valor_unitario_final !== null ||
        produto.valor_total_final !== null ||
        produto.valor_lote_final !== null ||
        produto.valor_global_final !== null
      )
    ) {
      produtosComPrecoFinal.push({
        item_numero: produto.item_numero || null,
        descricao: compactField(produto.descricao, 180),
        valor_unitario_final: produto.valor_unitario_final ?? null,
        valor_total_final: produto.valor_total_final ?? null,
        valor_final_tipo: produto.valor_final_tipo || null,
        fornecedor_nome: produto.fornecedor_nome || null
      });
    }
  });

  return {
    fornecedores: fornecedores.slice(0, 12),
    produtos_com_preco_final: produtosComPrecoFinal
  };
}

function getResumoDocumentoParaLeituraIntegrada(documentoId) {
  const resumo = aiJobsRepo.normalizeResumoAi(
    db
      .prepare(
        `SELECT *
         FROM documentos_resumos_ai
         WHERE documento_id = ?
           AND status = 'ok'
           AND provider <> 'mock'
           AND contrato_versao NOT LIKE '2.%'
         ORDER BY datetime(criado_em) DESC, id DESC
         LIMIT 1`
      )
      .get(documentoId)
  );

  if (!resumo) {return null;}

  return {
    id: resumo.id,
    contrato_versao: resumo.contrato_versao,
    criado_em: resumo.criado_em,
    titulo_curto: resumo.resumo_json?.titulo_curto || null,
    resumo_cidadao: resumo.resumo_json?.resumo_cidadao || null,
    objeto: resumo.resumo_json?.objeto?.descricao || null,
    valores: Array.isArray(resumo.resumo_json?.valores) ? resumo.resumo_json.valores.slice(0, 8) : [],
    datas_relevantes: Array.isArray(resumo.resumo_json?.datas_relevantes)
      ? resumo.resumo_json.datas_relevantes.slice(0, 8)
      : [],
    partes_envolvidas: Array.isArray(resumo.resumo_json?.partes_envolvidas)
      ? resumo.resumo_json.partes_envolvidas.slice(0, 8)
      : [],
    campos_nao_encontrados: Array.isArray(resumo.resumo_json?.campos_nao_encontrados)
      ? resumo.resumo_json.campos_nao_encontrados.slice(0, 10)
      : []
  };
}

function buildLicitacaoLeituraIntegradaPayload(documentoId) {
  const documento = getDocumentoById(Number(documentoId));
  if (!documento) {
    throw new Error(`Documento ${documentoId} nao encontrado`);
  }
  if (documento.tipo !== 'edital') {
    throw new Error(`Documento ${documentoId} nao e uma licitacao/edital`);
  }

  const produtosTodos = getLicitacaoProdutosByDocumentoId(documento.id).dados.map(compactProdutoParaLeituraIntegrada);
  const produtos = produtosTodos.slice(0, 40);
  const produtoAmostras = buildProdutoAmostrasParaLeituraIntegrada(produtosTodos);
  const fontesPncp = (documento.licitacao_fontes_relacionadas || []).map((fonte) => ({
    id: fonte.id,
    fonte: fonte.fonte,
    identificador: fonte.identificador,
    url: fonte.url || null,
    status_correspondencia: fonte.status_correspondencia,
    score: fonte.score ?? null,
    candidato_resumo: fonte.candidato_resumo || null,
    correlacao: fonte.correlacao || null,
    estrategia_busca: fonte.estrategia_busca || null
  }));
  const divergencias = fontesPncp.flatMap((fonte) =>
    Array.isArray(fonte.correlacao?.divergencias)
      ? fonte.correlacao.divergencias.map((divergencia) => ({
          ...divergencia,
          fonte_relacionada_id: fonte.id,
          identificador: fonte.identificador
        }))
      : []
  );
  const alertas = fontesPncp.flatMap((fonte) =>
    Array.isArray(fonte.correlacao?.alertas)
      ? fonte.correlacao.alertas.map((alerta) => ({
          alerta,
          fonte_relacionada_id: fonte.id,
          identificador: fonte.identificador
        }))
      : []
  );

  const payload = {
    contrato_entrada: 'licitacao_correlacionada:1.0',
    gerado_em: new Date().toISOString(),
    documento: {
      id: documento.id,
      fonte: documento.fonte,
      fonte_nome: documento.fonte_nome,
      numero: documento.numero || null,
      ano: documento.ano || null,
      titulo: documento.titulo,
      resumo: documento.resumo || null,
      data_publicacao: documento.data_publicacao || null,
      data_abertura: documento.data_abertura || null,
      valor_estimado: documento.valor_estimado ?? null,
      url_origem: documento.url_origem || null,
      url_pdf: documento.url_pdf || null,
      hash_conteudo: documento.hash_conteudo || null
    },
    licitacao_modelo: documento.licitacao_modelo || null,
    licitacao_detalhes: documento.licitacao_detalhes || null,
    grupo: documento.licitacao_grupo || null,
    produtos,
    produtos_total_estruturado: produtosTodos.length,
    produtos_payload_limitado: produtosTodos.length > produtos.length,
    produtos_resumo: documento.produtos_licitados_resumo || null,
    produtos_amostras: produtoAmostras,
    fontes_pncp: fontesPncp,
    divergencias,
    alertas,
    resumo_documento: getResumoDocumentoParaLeituraIntegrada(documento.id),
    lacunas_conhecidas: [
      documento.licitacao_grupo ? null : 'sem_grupo_de_processo',
      produtosTodos.length ? null : 'sem_produtos_estruturados',
      fontesPncp.length ? null : 'sem_correspondencia_pncp',
      documento.licitacao_detalhes?.valor_final !== null ? null : 'sem_valor_final_local',
      documento.licitacao_detalhes?.vencedor_nome ? null : 'sem_vencedor_local'
    ].filter(Boolean)
  };

  return {
    documento_id: documento.id,
    texto_hash: buildJsonHash({
      ...payload,
      gerado_em: null
    }),
    payload
  };
}

function upsertLicitacaoDetalhesExtraidos(documento, detalhes) {
  const now = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO licitacoes_detalhes (
        documento_id, modalidade, status, vencedor_nome, vencedor_cnpj,
        valor_final, numero_pncp, data_homologacao,
        origem, origem_detalhe, trecho_fonte, confianca, atualizado_em
      ) VALUES (
        @documento_id, @modalidade, @status, @vencedor_nome, @vencedor_cnpj,
        @valor_final, @numero_pncp, @data_homologacao,
        @origem, @origem_detalhe, @trecho_fonte, @confianca, @atualizado_em
      )
      ON CONFLICT(documento_id) DO UPDATE SET
        modalidade = COALESCE(licitacoes_detalhes.modalidade, excluded.modalidade),
        status = COALESCE(licitacoes_detalhes.status, excluded.status),
        vencedor_nome = CASE
          WHEN excluded.vencedor_nome IS NOT NULL
            AND (licitacoes_detalhes.vencedor_nome IS NULL OR IFNULL(licitacoes_detalhes.origem, '') LIKE 'texto_%')
          THEN excluded.vencedor_nome
          ELSE licitacoes_detalhes.vencedor_nome
        END,
        vencedor_cnpj = CASE
          WHEN excluded.vencedor_cnpj IS NOT NULL
            AND (licitacoes_detalhes.vencedor_cnpj IS NULL OR IFNULL(licitacoes_detalhes.origem, '') LIKE 'texto_%')
          THEN excluded.vencedor_cnpj
          ELSE licitacoes_detalhes.vencedor_cnpj
        END,
        valor_final = CASE
          WHEN excluded.valor_final IS NOT NULL
            AND (licitacoes_detalhes.valor_final IS NULL OR IFNULL(licitacoes_detalhes.origem, '') LIKE 'texto_%')
          THEN excluded.valor_final
          ELSE licitacoes_detalhes.valor_final
        END,
        numero_pncp = COALESCE(licitacoes_detalhes.numero_pncp, excluded.numero_pncp),
        data_homologacao = CASE
          WHEN excluded.data_homologacao IS NOT NULL
            AND (licitacoes_detalhes.data_homologacao IS NULL OR IFNULL(licitacoes_detalhes.origem, '') LIKE 'texto_%')
          THEN excluded.data_homologacao
          ELSE licitacoes_detalhes.data_homologacao
        END,
        origem = CASE
          WHEN excluded.origem IS NOT NULL
            AND (
              licitacoes_detalhes.origem IS NULL
              OR IFNULL(licitacoes_detalhes.origem, '') LIKE 'texto_%'
              OR licitacoes_detalhes.vencedor_nome IS NULL
              OR licitacoes_detalhes.valor_final IS NULL
            )
          THEN excluded.origem
          ELSE licitacoes_detalhes.origem
        END,
        origem_detalhe = COALESCE(excluded.origem_detalhe, licitacoes_detalhes.origem_detalhe),
        trecho_fonte = COALESCE(excluded.trecho_fonte, licitacoes_detalhes.trecho_fonte),
        confianca = COALESCE(excluded.confianca, licitacoes_detalhes.confianca),
        atualizado_em = excluded.atualizado_em`
    )
    .run({
      documento_id: documento.id,
      modalidade: documento.modalidade || null,
      status: detalhes.status || null,
      vencedor_nome: detalhes.vencedor_nome || null,
      vencedor_cnpj: detalhes.vencedor_cnpj || null,
      valor_final: detalhes.valor_final ?? null,
      numero_pncp: detalhes.numero_pncp || null,
      data_homologacao: detalhes.data_homologacao || null,
      origem: detalhes.origem || null,
      origem_detalhe: detalhes.origem_detalhe || null,
      trecho_fonte: detalhes.trecho_fonte || null,
      confianca: detalhes.confianca ?? null,
      atualizado_em: now
    });

  return result.changes || 0;
}

function getDocumentoByNumeroPncp(numeroPncp) {
  if (!numeroPncp) {return null;}
  return (
    db
      .prepare(
        `SELECT d.id, d.numero, d.ano, d.titulo, d.fonte, d.tipo
         FROM documentos d
         JOIN licitacoes_detalhes ld ON ld.documento_id = d.id
         WHERE ld.numero_pncp = ?
         LIMIT 1`
      )
      .get(String(numeroPncp)) || null
  );
}

function upsertDadosPncp(documentoId, { vencedor_nome, vencedor_cnpj, valor_final, numero_pncp, data_resultado } = {}) {
  const now = new Date().toISOString();
  return (
    db
      .prepare(
        `INSERT INTO licitacoes_detalhes (documento_id, vencedor_nome, vencedor_cnpj, valor_final, numero_pncp, data_homologacao, origem, atualizado_em)
         VALUES (@documento_id, @vencedor_nome, @vencedor_cnpj, @valor_final, @numero_pncp, @data_homologacao, 'pncp_orgaos', @atualizado_em)
         ON CONFLICT(documento_id) DO UPDATE SET
           vencedor_nome = CASE WHEN @vencedor_nome IS NOT NULL THEN @vencedor_nome ELSE licitacoes_detalhes.vencedor_nome END,
           vencedor_cnpj = CASE WHEN @vencedor_cnpj IS NOT NULL THEN @vencedor_cnpj ELSE licitacoes_detalhes.vencedor_cnpj END,
           valor_final   = CASE WHEN @valor_final IS NOT NULL THEN @valor_final ELSE licitacoes_detalhes.valor_final END,
           numero_pncp   = COALESCE(licitacoes_detalhes.numero_pncp, @numero_pncp),
           data_homologacao = CASE WHEN @data_homologacao IS NOT NULL AND licitacoes_detalhes.data_homologacao IS NULL THEN @data_homologacao ELSE licitacoes_detalhes.data_homologacao END,
           origem        = CASE
             WHEN licitacoes_detalhes.vencedor_nome IS NULL OR IFNULL(licitacoes_detalhes.origem, '') LIKE 'texto_%'
             THEN 'pncp_orgaos'
             ELSE licitacoes_detalhes.origem
           END,
           atualizado_em = @atualizado_em`
      )
      .run({
        documento_id: Number(documentoId),
        vencedor_nome: vencedor_nome || null,
        vencedor_cnpj: vencedor_cnpj || null,
        valor_final: valor_final ?? null,
        numero_pncp: numero_pncp || null,
        data_homologacao: data_resultado || null,
        atualizado_em: now
      }).changes || 0
  );
}

function estruturarDetalhesLicitacoes({ ano = new Date().getFullYear(), limite } = {}) {
  const filters = ["d.tipo = 'edital'", "IFNULL(d.texto_completo, '') <> ''"];
  const params = {};

  if (ano) {
    filters.push('d.ano = @ano');
    params.ano = Number(ano);
  }

  const limitClause = limite ? 'LIMIT @limite' : '';
  if (limite) {
    params.limite = Math.max(Number(limite), 1);
  }

  const rows = db
    .prepare(
      `SELECT d.id, d.numero, d.ano, d.titulo, d.texto_completo, d.dados_extras,
              ld.modalidade, ld.status, ld.vencedor_nome, ld.vencedor_cnpj,
              ld.valor_final, ld.numero_pncp, ld.data_homologacao,
              ld.origem, ld.origem_detalhe, ld.trecho_fonte, ld.confianca
       FROM documentos d
       LEFT JOIN licitacoes_detalhes ld ON ld.documento_id = d.id
       WHERE ${filters.join(' AND ')}
       ORDER BY COALESCE(d.data_abertura, d.data_publicacao, d.atualizado_em) DESC, d.id DESC
       ${limitClause}`
    )
    .all(params);

  const resultado = {
    ano: ano ? Number(ano) : null,
    documentos_processados: rows.length,
    documentos_com_detalhes_extraidos: 0,
    documentos_sem_detalhes: 0,
    com_vencedor: 0,
    com_valor_final: 0,
    com_data_homologacao: 0,
    detalhes_salvos: 0
  };

  rows.forEach((row) => {
    const extras = deepRepairStrings(parseJson(row.dados_extras)) || {};
    const anexos = Array.isArray(extras.anexos) ? extras.anexos : [];
    const detalhes = parseLicitacaoDetalhes(row.texto_completo, { anexos });

    if (!detalhes) {
      resultado.documentos_sem_detalhes += 1;
      return;
    }

    resultado.documentos_com_detalhes_extraidos += 1;
    if (detalhes.vencedor_nome || detalhes.vencedor_cnpj) {resultado.com_vencedor += 1;}
    if (detalhes.valor_final !== null) {resultado.com_valor_final += 1;}
    if (detalhes.data_homologacao) {resultado.com_data_homologacao += 1;}
    resultado.detalhes_salvos += upsertLicitacaoDetalhesExtraidos(row, detalhes);
  });

  return resultado;
}

function upsertLicitacaoProduto(produto) {
  const now = new Date().toISOString();

  const result = db
    .prepare(
      `INSERT INTO licitacoes_produtos (
        documento_id, ano, processo, modalidade, item_numero, lote_numero,
        descricao, descricao_normalizada, unidade, quantidade,
        valor_unitario_estimado, valor_total_estimado,
        valor_unitario_final, valor_total_final,
        valor_final_tipo, valor_lote_final, valor_global_final,
        fornecedor_nome, fornecedor_cnpj, origem, origem_detalhe,
        trecho_fonte, resumo_ai_id, confianca, status_revisao,
        hash_item, criado_em, atualizado_em
      ) VALUES (
        @documento_id, @ano, @processo, @modalidade, @item_numero, @lote_numero,
        @descricao, @descricao_normalizada, @unidade, @quantidade,
        @valor_unitario_estimado, @valor_total_estimado,
        @valor_unitario_final, @valor_total_final,
        @valor_final_tipo, @valor_lote_final, @valor_global_final,
        @fornecedor_nome, @fornecedor_cnpj, @origem, @origem_detalhe,
        @trecho_fonte, @resumo_ai_id, @confianca, @status_revisao,
        @hash_item, @criado_em, @atualizado_em
      )
      ON CONFLICT(documento_id, hash_item) DO UPDATE SET
        ano = excluded.ano,
        processo = excluded.processo,
        modalidade = excluded.modalidade,
        item_numero = excluded.item_numero,
        lote_numero = excluded.lote_numero,
        descricao = excluded.descricao,
        descricao_normalizada = excluded.descricao_normalizada,
        unidade = excluded.unidade,
        quantidade = excluded.quantidade,
        valor_unitario_estimado = COALESCE(excluded.valor_unitario_estimado, licitacoes_produtos.valor_unitario_estimado),
        valor_total_estimado = COALESCE(excluded.valor_total_estimado, licitacoes_produtos.valor_total_estimado),
        valor_unitario_final = CASE
          WHEN excluded.valor_final_tipo IN ('lote', 'global') THEN excluded.valor_unitario_final
          ELSE COALESCE(excluded.valor_unitario_final, licitacoes_produtos.valor_unitario_final)
        END,
        valor_total_final = CASE
          WHEN excluded.valor_final_tipo IN ('lote', 'global') THEN excluded.valor_total_final
          ELSE COALESCE(excluded.valor_total_final, licitacoes_produtos.valor_total_final)
        END,
        valor_final_tipo = COALESCE(excluded.valor_final_tipo, licitacoes_produtos.valor_final_tipo),
        valor_lote_final = CASE
          WHEN excluded.valor_final_tipo IN ('unitario', 'total_item', 'lote', 'global') THEN excluded.valor_lote_final
          ELSE COALESCE(excluded.valor_lote_final, licitacoes_produtos.valor_lote_final)
        END,
        valor_global_final = CASE
          WHEN excluded.valor_final_tipo IN ('unitario', 'total_item', 'lote', 'global') THEN excluded.valor_global_final
          ELSE COALESCE(excluded.valor_global_final, licitacoes_produtos.valor_global_final)
        END,
        fornecedor_nome = COALESCE(excluded.fornecedor_nome, licitacoes_produtos.fornecedor_nome),
        fornecedor_cnpj = COALESCE(excluded.fornecedor_cnpj, licitacoes_produtos.fornecedor_cnpj),
        origem = CASE
          WHEN IFNULL(licitacoes_produtos.origem, '') LIKE '%ata_resultado%'
            AND IFNULL(excluded.origem, '') NOT LIKE '%ata_resultado%'
          THEN licitacoes_produtos.origem
          ELSE excluded.origem
        END,
        origem_detalhe = CASE
          WHEN IFNULL(licitacoes_produtos.origem_detalhe, '') LIKE '%ata_resultado%'
            AND IFNULL(excluded.origem_detalhe, '') NOT LIKE '%ata_resultado%'
          THEN licitacoes_produtos.origem_detalhe
          ELSE excluded.origem_detalhe
        END,
        trecho_fonte = CASE
          WHEN IFNULL(licitacoes_produtos.origem, '') LIKE '%ata_resultado%'
            AND IFNULL(excluded.origem, '') NOT LIKE '%ata_resultado%'
          THEN licitacoes_produtos.trecho_fonte
          ELSE excluded.trecho_fonte
        END,
        resumo_ai_id = excluded.resumo_ai_id,
        confianca = COALESCE(excluded.confianca, licitacoes_produtos.confianca),
        status_revisao = CASE
          WHEN licitacoes_produtos.status_revisao = 'validado' THEN licitacoes_produtos.status_revisao
          ELSE excluded.status_revisao
        END,
        atualizado_em = excluded.atualizado_em`
    )
    .run({
      ...produto,
      valor_final_tipo: normalizeValorFinalTipo(produto.valor_final_tipo),
      valor_lote_final: parsePositiveNumericField(produto.valor_lote_final),
      valor_global_final: parsePositiveNumericField(produto.valor_global_final),
      criado_em: now,
      atualizado_em: now
    });

  return result.changes || 0;
}

function getLicitacaoRowParaProdutos(documentoId) {
  return db
    .prepare(
      `SELECT d.id, d.fonte, d.tipo, d.numero, d.ano, d.titulo, d.resumo,
              d.data_publicacao, d.data_abertura, d.valor_estimado,
              d.url_origem, d.url_pdf, d.hash_conteudo, d.status_coleta,
              d.dados_extras, d.texto_completo,
              d.coletado_em, d.atualizado_em,
              LENGTH(IFNULL(d.texto_completo, '')) AS texto_completo_chars,
              ld.modalidade, ld.status, ld.vencedor_nome, ld.vencedor_cnpj,
              ld.valor_final, ld.numero_pncp, ld.data_homologacao,
              ld.origem, ld.origem_detalhe, ld.trecho_fonte, ld.confianca,
              ld.atualizado_em AS detalhes_atualizado_em,
              EXISTS (
                SELECT 1
                FROM documentos_resumos_ai rai
                WHERE rai.documento_id = d.id
                  AND rai.status = 'ok'
                  AND rai.provider <> 'mock'
              ) AS tem_resumo_ai
       FROM documentos d
       LEFT JOIN licitacoes_detalhes ld ON ld.documento_id = d.id
       WHERE d.id = ?`
    )
    .get(documentoId);
}

function estruturarProdutosDeResumoAi(documentoId, resumoAi) {
  const resultado = {
    documento_id: Number(documentoId),
    produtos_extraidos: 0,
    produtos_salvos: 0
  };

  if (!resumoAi || resumoAi.status !== 'ok') {return resultado;}

  const row = getLicitacaoRowParaProdutos(documentoId);
  if (!row || row.tipo !== 'edital') {return resultado;}

  const documento = normalizeLicitacao(row);
  const modelo = documento.licitacao_modelo || {};
  const resumo = deepRepairStrings(resumoAi.resumo_json || {}) || {};
  const itens = Array.isArray(resumo.itens_licitados) ? resumo.itens_licitados : [];
  const itensTabela = parseProdutosLicitados(row.texto_completo || '');

  const produtosTabela = itensTabela.length >= 5
    ? itensTabela
        .map((item) => normalizeProdutoLicitadoFromTabela(item, { documento, modelo }))
        .filter(Boolean)
    : [];
  const produtosIa = produtosTabela.length
    ? []
    : itens
        .map((item) =>
          normalizeProdutoLicitadoFromAi(item, {
            documento,
            modelo,
            resumoAiId: resumoAi.id,
            confianca: resumo.confianca
          })
        )
        .filter(Boolean);
  const produtos = dedupeProdutosLicitados(produtosTabela.length ? produtosTabela : produtosIa);

  resultado.produtos_extraidos = produtos.length;
  if (produtos.length) {
    clearProdutosExtraidosNaoValidados(documentoId);
  }
  produtos.forEach((produto) => {
    resultado.produtos_salvos += upsertLicitacaoProduto(produto);
  });

  return resultado;
}

function estruturarProdutosLicitacoes({ ano = new Date().getFullYear(), limite } = {}) {
  const filters = ["d.tipo = 'edital'"];
  const params = {};

  if (ano) {
    filters.push('d.ano = @ano');
    params.ano = Number(ano);
  }

  const limitClause = limite ? 'LIMIT @limite' : '';
  if (limite) {
    params.limite = Math.max(Number(limite), 1);
  }

  const rows = db
    .prepare(
      `SELECT d.id, d.fonte, d.tipo, d.numero, d.ano, d.titulo, d.resumo,
              d.data_publicacao, d.data_abertura, d.valor_estimado,
              d.url_origem, d.url_pdf, d.hash_conteudo, d.status_coleta,
              d.dados_extras, d.texto_completo,
              d.coletado_em, d.atualizado_em,
              LENGTH(IFNULL(d.texto_completo, '')) AS texto_completo_chars,
              ld.modalidade, ld.status, ld.vencedor_nome, ld.vencedor_cnpj,
              ld.valor_final, ld.numero_pncp, ld.data_homologacao,
              ld.origem, ld.origem_detalhe, ld.trecho_fonte, ld.confianca,
              ld.atualizado_em AS detalhes_atualizado_em,
              r.id AS resumo_ai_id, r.resumo_json,
              EXISTS (
                SELECT 1
                FROM documentos_resumos_ai rai
                WHERE rai.documento_id = d.id
                  AND rai.status = 'ok'
                  AND rai.provider <> 'mock'
              ) AS tem_resumo_ai
       FROM documentos d
       LEFT JOIN licitacoes_detalhes ld ON ld.documento_id = d.id
       LEFT JOIN documentos_resumos_ai r ON r.id = (
         SELECT r2.id
         FROM documentos_resumos_ai r2
         WHERE r2.documento_id = d.id
           AND r2.status = 'ok'
           AND r2.provider <> 'mock'
         ORDER BY datetime(r2.criado_em) DESC, r2.id DESC
         LIMIT 1
       )
       WHERE ${filters.join(' AND ')}
       ORDER BY COALESCE(d.data_abertura, d.data_publicacao, d.atualizado_em) DESC, d.id DESC
       ${limitClause}`
    )
    .all(params);

  const resultado = {
    ano: ano ? Number(ano) : null,
    documentos_processados: rows.length,
    documentos_com_resumo: 0,
    documentos_com_itens_extraidos: 0,
    produtos_extraidos: 0,
    produtos_salvos: 0,
    documentos_sem_itens: 0
  };

  rows.forEach((row) => {
    const documento = normalizeLicitacao(row);
    const modelo = documento.licitacao_modelo || {};
    const resumo = deepRepairStrings(parseJson(row.resumo_json)) || {};
    const itens = Array.isArray(resumo.itens_licitados) ? resumo.itens_licitados : [];
    const itensTabela = parseProdutosLicitados(row.texto_completo || '');

    if (row.resumo_ai_id) {resultado.documentos_com_resumo += 1;}
    const produtosTabela = itensTabela.length >= 5
      ? itensTabela
          .map((item) => normalizeProdutoLicitadoFromTabela(item, { documento, modelo }))
          .filter(Boolean)
      : [];
    const produtosIa = produtosTabela.length
      ? []
      : itens
          .map((item) =>
            normalizeProdutoLicitadoFromAi(item, {
              documento,
              modelo,
              resumoAiId: row.resumo_ai_id,
              confianca: resumo.confianca
            })
          )
          .filter(Boolean);
    const produtos = dedupeProdutosLicitados(produtosTabela.length ? produtosTabela : produtosIa);

    if (!produtos.length) {
      resultado.documentos_sem_itens += 1;
      return;
    }

    clearProdutosExtraidosNaoValidados(documento.id);
    resultado.documentos_com_itens_extraidos += 1;
    resultado.produtos_extraidos += produtos.length;
    produtos.forEach((produto) => {
      resultado.produtos_salvos += upsertLicitacaoProduto(produto);
    });
  });

  return resultado;
}

const RESULTADO_ANEXO_TIPOS = ['ata', 'classificacao', 'resultado', 'homologacao', 'contrato'];

function _isResultadoAnexoTipo(tipo) {
  return RESULTADO_ANEXO_TIPOS.includes(tipo);
}

function syncDocumentoAnexosLicitacao({ ano = new Date().getFullYear(), documentoId, limite } = {}) {
  const filters = ["d.tipo = 'edital'"];
  const params = {};

  if (ano) {
    filters.push('d.ano = @ano');
    params.ano = Number(ano);
  }

  if (documentoId) {
    filters.push('d.id = @documentoId');
    params.documentoId = Number(documentoId);
  }

  const limitClause = limite ? 'LIMIT @limite' : '';
  if (limite) {
    params.limite = Math.max(Number(limite), 1);
  }

  const rows = db
    .prepare(
      `SELECT d.id, d.dados_extras
       FROM documentos d
       WHERE ${filters.join(' AND ')}
       ORDER BY COALESCE(d.data_abertura, d.data_publicacao, d.atualizado_em) DESC, d.id DESC
       ${limitClause}`
    )
    .all(params);

  const upsert = db.prepare(
    `INSERT INTO documentos_anexos (
      documento_id, nome, tipo, file_id, url, datahora, atualizado_em
    ) VALUES (
      @documento_id, @nome, @tipo, @file_id, @url, @datahora, @atualizado_em
    )
    ON CONFLICT(documento_id, url) DO UPDATE SET
      nome = excluded.nome,
      tipo = excluded.tipo,
      file_id = COALESCE(excluded.file_id, documentos_anexos.file_id),
      datahora = COALESCE(excluded.datahora, documentos_anexos.datahora),
      atualizado_em = excluded.atualizado_em`
  );

  let anexosEncontrados = 0;
  let anexosSincronizados = 0;

  rows.forEach((row) => {
    const extras = deepRepairStrings(parseJson(row.dados_extras)) || {};
    const anexos = Array.isArray(extras.anexos) ? extras.anexos : [];

    anexos.forEach((anexo) => {
      const url = isUsableUrl(anexo?.url);
      if (!url) {return;}

      anexosEncontrados += 1;
      const result = upsert.run({
        documento_id: row.id,
        nome: cleanField(anexo?.nome) || 'anexo',
        tipo: classifyAnexo(anexo?.nome),
        file_id: cleanField(anexo?.fileId),
        url,
        datahora: cleanField(anexo?.datahora),
        atualizado_em: new Date().toISOString()
      });
      anexosSincronizados += result.changes || 0;
    });
  });

  return {
    documentos_processados: rows.length,
    anexos_encontrados: anexosEncontrados,
    anexos_sincronizados: anexosSincronizados
  };
}

function listDocumentoAnexosParaExtracao({
  ano = new Date().getFullYear(),
  documentoId,
  limite,
  force = false
} = {}) {
  syncDocumentoAnexosLicitacao({ ano, documentoId });

  const filters = [`da.tipo IN ('${RESULTADO_ANEXO_TIPOS.join("','")}')`];
  const params = {};

  if (ano) {
    filters.push('d.ano = @ano');
    params.ano = Number(ano);
  }

  if (documentoId) {
    filters.push('da.documento_id = @documentoId');
    params.documentoId = Number(documentoId);
  }

  if (!force) {
    filters.push("(da.status_extracao IS NULL OR da.status_extracao <> 'ok' OR IFNULL(da.texto_completo, '') = '')");
    // PDFs escaneados aguardam pipeline de OCR (flag 'requer_ocr') — re-extrair
    // sem OCR sempre devolve "texto vazio"; só reprocessar com --force
    filters.push("IFNULL(da.status_extracao, '') <> 'requer_ocr'");
  }

  const limitClause = limite ? 'LIMIT @limite' : '';
  if (limite) {
    params.limite = Math.max(Number(limite), 1);
  }

  return db
    .prepare(
      `SELECT da.*, d.ano, d.numero, d.titulo
       FROM documentos_anexos da
       JOIN documentos d ON d.id = da.documento_id
       WHERE ${filters.join(' AND ')}
       ORDER BY d.ano DESC, d.id DESC, da.id ASC
       ${limitClause}`
    )
    .all(params);
}

function saveDocumentoAnexoTexto({ id, texto, textoHash, status, erro, parser, paginas }) {
  return db
    .prepare(
      `UPDATE documentos_anexos
       SET texto_completo = @texto_completo,
           texto_hash = @texto_hash,
           status_extracao = @status_extracao,
           erro = @erro,
           parser = @parser,
           paginas = @paginas,
           atualizado_em = @atualizado_em,
           coletado_em = COALESCE(coletado_em, @atualizado_em)
       WHERE id = @id`
    )
    .run({
      id: Number(id),
      texto_completo: texto || null,
      texto_hash: textoHash || null,
      status_extracao: status || 'pendente',
      erro: erro || null,
      parser: parser || null,
      paginas: paginas ?? null,
      atualizado_em: new Date().toISOString()
    }).changes || 0;
}

function listDocumentoAnexosTextoResultados({ ano = new Date().getFullYear(), documentoId } = {}) {
  syncDocumentoAnexosLicitacao({ ano, documentoId });

  const filters = [
    `da.tipo IN ('${RESULTADO_ANEXO_TIPOS.join("','")}')`,
    "da.status_extracao = 'ok'",
    "IFNULL(da.texto_completo, '') <> ''"
  ];
  const params = {};

  if (ano) {
    filters.push('d.ano = @ano');
    params.ano = Number(ano);
  }

  if (documentoId) {
    filters.push('da.documento_id = @documentoId');
    params.documentoId = Number(documentoId);
  }

  return db
    .prepare(
      `SELECT da.*, d.ano, d.numero, d.titulo
       FROM documentos_anexos da
       JOIN documentos d ON d.id = da.documento_id
       WHERE ${filters.join(' AND ')}
       ORDER BY d.ano DESC, d.id DESC, da.id ASC`
    )
    .all(params);
}

function mergeTextParts(parts, maxLength = 1200) {
  const values = [];
  parts.forEach((part) => {
    const text = compactField(part, maxLength);
    if (text && !values.includes(text)) {values.push(text);}
  });

  return compactField(values.join(' | '), maxLength);
}

function mergeProdutoOrigem(current, next) {
  const values = [];
  String(current || '')
    .split('+')
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => {
      if (!values.includes(item)) {values.push(item);}
    });

  if (next && !values.includes(next)) {values.push(next);}
  return values.join('+') || next || current || 'ata_resultado';
}

function roundMoney(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : null;
}

function inferValorFinalTipoResultado({ atual, resultado, descricao, quantidade, valorFinal }) {
  if (quantidade) {return 'unitario';}

  const explicit = normalizeValorFinalTipo(resultado?.valor_final_tipo);
  if (explicit && explicit !== 'unitario') {return explicit;}

  const key = normalizeProdutoDescricao(
    [descricao, atual?.trecho_fonte, resultado?.trecho_fonte].filter(Boolean).join(' ')
  ) || '';

  if (/\bvalor global\b|\bglobal\b/.test(key)) {return 'global';}
  if (/\blote\b/.test(key) || atual?.lote_numero || resultado?.lote_numero) {return 'lote';}

  const looksLikeServiceOrWork =
    /\b(servico|servicos|prestacao|obra|reforma|construcao|ampliacao|engenharia|manutencao)\b/.test(key);
  if (looksLikeServiceOrWork && Number(valorFinal || 0) >= 1000) {return 'global';}

  return explicit || 'unitario';
}

function buildProdutoEnriquecidoPorResultado({ documento, modelo, atual, resultado, anexo }) {
  const descricao = compactField(atual?.descricao || resultado.descricao, 900);
  const valorResultadoFinal =
    parsePositiveNumericField(resultado.valor_total_final) ||
    parsePositiveNumericField(resultado.valor_unitario_final);
  if (!descricao || !resultado.item_numero || !valorResultadoFinal) {return null;}

  const quantidade = parsePositiveNumericField(atual?.quantidade);
  const valorTotalInformado = parsePositiveNumericField(resultado.valor_total_final);
  const valorFinalTipo = valorTotalInformado ? 'total_item' : inferValorFinalTipoResultado({
    atual,
    resultado,
    descricao,
    quantidade,
    valorFinal: valorResultadoFinal
  });
  const valorUnitarioFinal = valorFinalTipo === 'unitario' ? valorResultadoFinal : null;
  const valorTotalFinal =
    valorFinalTipo === 'total_item'
      ? valorResultadoFinal
      : valorUnitarioFinal && quantidade
        ? roundMoney(valorUnitarioFinal * quantidade)
        : null;
  const valorLoteFinal = valorFinalTipo === 'lote' ? valorResultadoFinal : null;
  const valorGlobalFinal = valorFinalTipo === 'global' ? valorResultadoFinal : null;
  const origemDetalheResultado = [
    resultado.origem_detalhe || 'ata:resultado',
    `ata_resultado:documentos_anexos:${anexo.id}`,
    anexo.nome || null
  ]
    .filter(Boolean)
    .join(':');

  const produto = {
    documento_id: documento.id,
    ano: documento.ano || null,
    processo: modelo.processo || documento.numero || null,
    modalidade: modelo.modalidade_nome || modelo.modalidade || null,
    item_numero: cleanField(resultado.item_numero),
    lote_numero: cleanField(atual?.lote_numero || resultado.lote_numero),
    descricao,
    descricao_normalizada: normalizeProdutoDescricao(descricao),
    unidade: cleanField(atual?.unidade || resultado.unidade),
    quantidade,
    valor_unitario_estimado: parsePositiveNumericField(atual?.valor_unitario_estimado),
    valor_total_estimado: parsePositiveNumericField(atual?.valor_total_estimado),
    valor_unitario_final: valorUnitarioFinal,
    valor_total_final: valorTotalInformado && valorFinalTipo !== 'lote' && valorFinalTipo !== 'global'
      ? valorTotalInformado
      : valorTotalFinal,
    valor_final_tipo: valorFinalTipo,
    valor_lote_final: valorLoteFinal,
    valor_global_final: valorGlobalFinal,
    fornecedor_nome: cleanField(resultado.fornecedor_nome || atual?.fornecedor_nome),
    fornecedor_cnpj: cleanField(resultado.fornecedor_cnpj || atual?.fornecedor_cnpj),
    origem: mergeProdutoOrigem(atual?.origem, resultado.origem || 'ata_resultado'),
    origem_detalhe: mergeTextParts([atual?.origem_detalhe, origemDetalheResultado], 600),
    trecho_fonte: mergeTextParts([atual?.trecho_fonte, resultado.trecho_fonte], 1400),
    resumo_ai_id: atual?.resumo_ai_id || null,
    confianca: Math.max(Number(atual?.confianca || 0), Number(resultado.confianca || 0.9)),
    status_revisao: atual?.status_revisao === 'validado' ? 'validado' : 'pendente'
  };

  produto.hash_item = buildProdutoHash(produto);
  return produto;
}

function enriquecerProdutosComResultadosAnexo({ documentoId, anexoId, texto }) {
  const row = getLicitacaoRowParaProdutos(documentoId);
  if (!row || row.tipo !== 'edital') {
    return {
      documento_id: Number(documentoId),
      anexo_id: Number(anexoId),
      itens_resultado_extraidos: 0,
      produtos_atualizados: 0,
      produtos_criados: 0,
      produtos_ignorados: 0
    };
  }

  const anexo = db.prepare('SELECT * FROM documentos_anexos WHERE id = ?').get(anexoId);
  const resultados = parseResultadosItensLicitacao(texto || '');
  const documento = normalizeLicitacao(row);
  const modelo = documento.licitacao_modelo || {};
  const atuais = db
    .prepare('SELECT * FROM licitacoes_produtos WHERE documento_id = ?')
    .all(documento.id);
  const atuaisPorItem = new Map(
    atuais
      .filter((item) => item.item_numero)
      .map((item) => [String(Number(item.item_numero)), item])
  );

  const resumo = {
    documento_id: documento.id,
    anexo_id: Number(anexoId),
    itens_resultado_extraidos: resultados.length,
    produtos_atualizados: 0,
    produtos_criados: 0,
    produtos_ignorados: 0
  };

  resultados.forEach((resultado) => {
    const key = String(Number(resultado.item_numero));
    const atual = atuaisPorItem.get(key) || null;

    if (atual?.status_revisao === 'validado') {
      resumo.produtos_ignorados += 1;
      return;
    }

    const produto = buildProdutoEnriquecidoPorResultado({
      documento,
      modelo,
      atual,
      resultado,
      anexo: anexo || { id: anexoId }
    });

    if (!produto) {
      resumo.produtos_ignorados += 1;
      return;
    }

    upsertLicitacaoProduto(produto);
    if (atual) {
      resumo.produtos_atualizados += 1;
    } else {
      resumo.produtos_criados += 1;
      atuaisPorItem.set(key, produto);
    }
  });

  return resumo;
}

function buildProdutosWhere({ ano, documentoId, termo, origem, validacao }, params) {
  const filters = [];

  if (ano) {
    filters.push('lp.ano = @ano');
    params.ano = Number(ano);
  }

  if (documentoId) {
    filters.push('lp.documento_id = @documentoId');
    params.documentoId = Number(documentoId);
  }

  if (termo) {
    filters.push(
      `(lp.descricao LIKE @termo
        OR IFNULL(lp.descricao_normalizada, '') LIKE @termo
        OR IFNULL(lp.fornecedor_nome, '') LIKE @termo
        OR IFNULL(d.numero, '') LIKE @termo
        OR IFNULL(d.titulo, '') LIKE @termo)`
    );
    params.termo = likeParam(termo);
  }

  if (origem) {
    filters.push('lp.origem = @origem');
    params.origem = origem;
  }

  if (validacao) {
    if (validacao === 'sem_validacao') {
      filters.push(
        `NOT EXISTS (
          SELECT 1 FROM licitacoes_produtos_validacoes v
          WHERE v.produto_id = lp.id
        )`
      );
    } else {
      filters.push(
        `EXISTS (
          SELECT 1 FROM licitacoes_produtos_validacoes v
          WHERE v.produto_id = lp.id
            AND v.status = @validacao
        )`
      );
      params.validacao = validacao;
    }
  }

  return filters.length ? `WHERE ${filters.join(' AND ')}` : '';
}

function listLicitacaoProdutos({
  ano,
  documentoId,
  termo,
  origem,
  validacao,
  pagina = 1,
  limite = 20
} = {}) {
  const params = {};
  const whereClause = buildProdutosWhere({ ano, documentoId, termo, origem, validacao }, params);
  const safePagina = Math.max(Number(pagina || 1), 1);
  const safeLimite = Math.min(Math.max(Number(limite || 20), 1), 500);
  const offset = (safePagina - 1) * safeLimite;

  const total = db
    .prepare(
      `SELECT COUNT(*) AS total
       FROM licitacoes_produtos lp
       JOIN documentos d ON d.id = lp.documento_id
       ${whereClause}`
    )
    .get(params).total;

  const dados = db
    .prepare(
      `SELECT lp.*,
              d.numero AS documento_numero,
              d.titulo AS documento_titulo,
              d.fonte AS documento_fonte,
              d.url_origem AS documento_url_origem,
              d.url_pdf AS documento_url_pdf,
              (
                SELECT v.status
                FROM licitacoes_produtos_validacoes v
                WHERE v.produto_id = lp.id
                ORDER BY datetime(v.validado_em) DESC, v.id DESC
                LIMIT 1
              ) AS validacao_status,
              (
                SELECT COUNT(*)
                FROM licitacoes_produtos_validacoes v
                WHERE v.produto_id = lp.id
              ) AS validacoes_total
       FROM licitacoes_produtos lp
       JOIN documentos d ON d.id = lp.documento_id
       ${whereClause}
       ORDER BY COALESCE(lp.ano, 0) DESC,
                lp.documento_id DESC,
                CAST(lp.lote_numero AS INTEGER),
                lp.lote_numero,
                CAST(lp.item_numero AS INTEGER),
                lp.item_numero,
                lp.id DESC
       LIMIT @limite OFFSET @offset`
    )
    .all({
      ...params,
      limite: safeLimite,
      offset
    })
    .map(normalizeProdutoRow);

  return {
    total,
    pagina: safePagina,
    limite: safeLimite,
    dados
  };
}

function getLicitacaoProdutosByDocumentoId(documentoId) {
  return listLicitacaoProdutos({
    documentoId,
    pagina: 1,
    limite: 500
  });
}

function getLicitacaoProdutosResumo(documentoId) {
  const row = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN valor_unitario_estimado IS NOT NULL OR valor_total_estimado IS NOT NULL THEN 1 ELSE 0 END) AS com_preco_estimado,
         SUM(CASE WHEN valor_unitario_final IS NOT NULL OR valor_total_final IS NOT NULL OR valor_lote_final IS NOT NULL OR valor_global_final IS NOT NULL THEN 1 ELSE 0 END) AS com_preco_final,
         SUM(CASE WHEN valor_lote_final IS NOT NULL THEN 1 ELSE 0 END) AS com_valor_lote_final,
         SUM(CASE WHEN valor_global_final IS NOT NULL THEN 1 ELSE 0 END) AS com_valor_global_final,
         SUM(CASE WHEN IFNULL(fornecedor_nome, '') <> '' THEN 1 ELSE 0 END) AS com_fornecedor,
         ROUND(IFNULL(SUM(valor_total_estimado), 0), 2) AS valor_estimado_total_identificado,
         ROUND(IFNULL(SUM(CASE
           WHEN valor_total_final IS NOT NULL THEN valor_total_final
           WHEN valor_unitario_final IS NOT NULL AND quantidade IS NOT NULL THEN valor_unitario_final * quantidade
           ELSE 0
         END), 0), 2) AS valor_final_total_identificado,
         ROUND(IFNULL(SUM(valor_lote_final), 0), 2) AS valor_lote_total_identificado,
         ROUND(IFNULL(SUM(valor_global_final), 0), 2) AS valor_global_total_identificado,
         SUM(CASE WHEN NOT EXISTS (
           SELECT 1
           FROM licitacoes_produtos_validacoes v
           WHERE v.produto_id = licitacoes_produtos.id
         ) THEN 1 ELSE 0 END) AS sem_validacao
       FROM licitacoes_produtos
       WHERE documento_id = ?`
    )
    .get(documentoId);

  return {
    total: row.total || 0,
    com_preco_estimado: row.com_preco_estimado || 0,
    com_preco_final: row.com_preco_final || 0,
    com_valor_lote_final: row.com_valor_lote_final || 0,
    com_valor_global_final: row.com_valor_global_final || 0,
    com_fornecedor: row.com_fornecedor || 0,
    valor_estimado_total_identificado: row.valor_estimado_total_identificado || 0,
    valor_final_total_identificado: row.valor_final_total_identificado || 0,
    valor_lote_total_identificado: row.valor_lote_total_identificado || 0,
    valor_global_total_identificado: row.valor_global_total_identificado || 0,
    sem_validacao: row.sem_validacao || 0
  };
}

function getProdutoValorFinalEstruturado(produto) {
  if (produto.valor_global_final !== null) {
    return { campo: 'valor_global_final', tipo: 'global', valor: Number(produto.valor_global_final) };
  }
  if (produto.valor_lote_final !== null) {
    return { campo: 'valor_lote_final', tipo: 'lote', valor: Number(produto.valor_lote_final) };
  }
  if (produto.valor_total_final !== null) {
    return { campo: 'valor_total_final', tipo: 'total_item', valor: Number(produto.valor_total_final) };
  }
  if (produto.valor_unitario_final !== null && produto.quantidade !== null) {
    return {
      campo: 'valor_total_final_calculado',
      tipo: 'total_item',
      valor: roundMoney(Number(produto.valor_unitario_final) * Number(produto.quantidade))
    };
  }
  if (produto.valor_unitario_final !== null) {
    return { campo: 'valor_unitario_final', tipo: 'unitario', valor: Number(produto.valor_unitario_final) };
  }
  return null;
}

function buildProdutoValidationGroups(produtos) {
  const groups = new Map();

  produtos.forEach((produto) => {
    const valor = getProdutoValorFinalEstruturado(produto);
    if (!valor || !Number.isFinite(valor.valor)) {return;}

    const groupKey = `${produto.documento_id}|${valor.tipo}`;
    const current = groups.get(groupKey) || {
      documento_id: produto.documento_id,
      tipo: valor.tipo,
      campo: valor.campo,
      valor_agrupado: 0,
      produtos: []
    };

    current.valor_agrupado = roundMoney(current.valor_agrupado + valor.valor);
    current.produtos.push({ produto, valor });
    groups.set(groupKey, current);
  });

  return groups;
}

function compareValores({ extraido, encontrado, toleranciaAbs, toleranciaPct }) {
  if (encontrado === null || !Number.isFinite(Number(encontrado))) {
    return {
      status: 'sem_correspondencia',
      divergencia_abs: null,
      divergencia_pct: null
    };
  }

  const diff = roundMoney(Number(extraido) - Number(encontrado));
  const abs = Math.abs(diff);
  const pct = Number(encontrado) ? abs / Math.abs(Number(encontrado)) : null;
  const withinAbs = abs <= Number(toleranciaAbs);
  const withinPct = pct !== null && pct <= Number(toleranciaPct);

  return {
    status: withinAbs || withinPct ? 'validado' : 'divergente',
    divergencia_abs: diff,
    divergencia_pct: pct === null ? null : roundMoney(pct * 100)
  };
}

function validarProdutosLicitacoesValores({
  ano = new Date().getFullYear(),
  documentoId,
  incluirUnitarios = false,
  toleranciaAbs = 1,
  toleranciaPct = 0.01
} = {}) {
  const filters = [
    '(lp.valor_lote_final IS NOT NULL OR lp.valor_global_final IS NOT NULL OR lp.valor_total_final IS NOT NULL OR (lp.valor_unitario_final IS NOT NULL AND lp.quantidade IS NOT NULL))'
  ];
  const params = {};

  if (ano) {
    filters.push('lp.ano = @ano');
    params.ano = Number(ano);
  }

  if (documentoId) {
    filters.push('lp.documento_id = @documentoId');
    params.documentoId = Number(documentoId);
  }

  if (!incluirUnitarios) {
    filters.push('(lp.valor_lote_final IS NOT NULL OR lp.valor_global_final IS NOT NULL)');
  }

  const produtos = db.prepare(
    `SELECT lp.*,
            d.numero AS documento_numero,
            d.titulo AS documento_titulo,
            ld.valor_final AS valor_final_licitacao,
            ld.origem AS valor_final_licitacao_origem,
            ld.trecho_fonte AS valor_final_licitacao_trecho
     FROM licitacoes_produtos lp
     JOIN documentos d ON d.id = lp.documento_id
     LEFT JOIN licitacoes_detalhes ld ON ld.documento_id = lp.documento_id
     WHERE ${filters.join(' AND ')}
     ORDER BY lp.documento_id, CAST(lp.item_numero AS INTEGER), lp.item_numero, lp.id`
  ).all(params);

  const groups = buildProdutoValidationGroups(produtos);
  const resultado = {
    ano: ano ? Number(ano) : null,
    documento_id: documentoId ? Number(documentoId) : null,
    produtos_avaliados: produtos.length,
    grupos_avaliados: groups.size,
    validacoes_registradas: 0,
    validado: 0,
    divergente: 0,
    sem_correspondencia: 0,
    revisar: 0,
    pendente: 0,
    detalhes: []
  };

  groups.forEach((group) => {
    const baseProduto = group.produtos[0]?.produto;
    const valorFinalLicitacao = parsePositiveNumericField(baseProduto?.valor_final_licitacao);
    const comparison = compareValores({
      extraido: group.valor_agrupado,
      encontrado: valorFinalLicitacao,
      toleranciaAbs,
      toleranciaPct
    });

    group.produtos.forEach(({ produto, valor }) => {
      const payload = {
        regra: 'consistencia_documento_valor_final',
        ano: produto.ano,
        documento_id: produto.documento_id,
        documento_numero: produto.documento_numero,
        documento_titulo: produto.documento_titulo,
        produto_id: produto.id,
        item_numero: produto.item_numero,
        lote_numero: produto.lote_numero,
        valor_produto: valor.valor,
        campo_produto: valor.campo,
        tipo_valor: valor.tipo,
        valor_agrupado_documento: group.valor_agrupado,
        valor_final_licitacao: valorFinalLicitacao,
        valor_final_licitacao_origem: produto.valor_final_licitacao_origem,
        valor_final_licitacao_trecho: produto.valor_final_licitacao_trecho,
        tolerancia_abs: Number(toleranciaAbs),
        tolerancia_pct: Number(toleranciaPct)
      };

      resultado.validacoes_registradas += upsertLicitacaoProdutoValidacao({
        produto_id: produto.id,
        fonte: 'consistencia_interna',
        sistema_origem: 'licitacoes_detalhes',
        valor_encontrado: valorFinalLicitacao,
        campo_validado: valor.campo,
        status: comparison.status,
        divergencia_abs: comparison.divergencia_abs,
        divergencia_pct: comparison.divergencia_pct,
        payload_json: payload
      });

      resultado[comparison.status] = (resultado[comparison.status] || 0) + 1;
    });

    resultado.detalhes.push({
      documento_id: baseProduto?.documento_id,
      documento_numero: baseProduto?.documento_numero,
      tipo_valor: group.tipo,
      produtos: group.produtos.length,
      valor_agrupado_documento: group.valor_agrupado,
      valor_final_licitacao: valorFinalLicitacao,
      status: comparison.status,
      divergencia_abs: comparison.divergencia_abs,
      divergencia_pct: comparison.divergencia_pct
    });
  });

  return resultado;
}

function getLicitacaoAnaliseAnual({ ano = new Date().getFullYear() } = {}) {
  const selectedYear = Number(ano || new Date().getFullYear());
  const licitacoesPorAno = listLicitacoesPorAnoStats();
  const licitacoesAno =
    licitacoesPorAno.find((item) => Number(item.ano) === selectedYear) || {
      ano: selectedYear,
      total: 0,
      com_resumo_ai: 0,
      com_ata: 0,
      com_contrato: 0,
      com_valor_estimado: 0,
      com_valor_final: 0,
      com_vencedor: 0,
      valor_final_total: 0,
      modalidades: []
    };
  const yearParams = { ano: selectedYear };
  const estimatedExpr =
    'COALESCE(valor_total_estimado, CASE WHEN valor_unitario_estimado IS NOT NULL AND quantidade IS NOT NULL THEN valor_unitario_estimado * quantidade END)';
  const finalExpr =
    'COALESCE(valor_total_final, CASE WHEN valor_unitario_final IS NOT NULL AND quantidade IS NOT NULL THEN valor_unitario_final * quantidade END)';

  const produtos = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         COUNT(DISTINCT documento_id) AS documentos_com_produtos,
         SUM(CASE WHEN valor_unitario_estimado IS NOT NULL OR valor_total_estimado IS NOT NULL THEN 1 ELSE 0 END) AS com_preco_estimado,
         SUM(CASE WHEN valor_unitario_final IS NOT NULL OR valor_total_final IS NOT NULL OR valor_lote_final IS NOT NULL OR valor_global_final IS NOT NULL THEN 1 ELSE 0 END) AS com_preco_final,
         SUM(CASE WHEN ${finalExpr} IS NOT NULL THEN 1 ELSE 0 END) AS com_preco_final_calculavel,
         SUM(CASE WHEN valor_unitario_final IS NOT NULL THEN 1 ELSE 0 END) AS com_valor_unitario_final,
         SUM(CASE WHEN valor_total_final IS NOT NULL THEN 1 ELSE 0 END) AS com_valor_total_final,
         SUM(CASE WHEN valor_lote_final IS NOT NULL THEN 1 ELSE 0 END) AS com_valor_lote_final,
         SUM(CASE WHEN valor_global_final IS NOT NULL THEN 1 ELSE 0 END) AS com_valor_global_final,
         SUM(CASE WHEN IFNULL(fornecedor_nome, '') <> '' THEN 1 ELSE 0 END) AS com_fornecedor,
         SUM(CASE WHEN NOT EXISTS (
           SELECT 1
           FROM licitacoes_produtos_validacoes v
           WHERE v.produto_id = licitacoes_produtos.id
         ) THEN 1 ELSE 0 END) AS sem_validacao,
         ROUND(IFNULL(SUM(${estimatedExpr}), 0), 2) AS valor_estimado_total_identificado,
         ROUND(IFNULL(SUM(${finalExpr}), 0), 2) AS valor_final_total_identificado,
         ROUND(IFNULL(SUM(valor_lote_final), 0), 2) AS valor_lote_total_identificado,
         ROUND(IFNULL(SUM(valor_global_final), 0), 2) AS valor_global_total_identificado
       FROM licitacoes_produtos
       WHERE ano = @ano`
    )
    .get(yearParams);

  const fornecedores = db
    .prepare(
      `SELECT fornecedor_nome, fornecedor_cnpj,
              COUNT(*) AS produtos,
              ROUND(IFNULL(SUM(${estimatedExpr}), 0), 2) AS valor_estimado_identificado,
              ROUND(IFNULL(SUM(${finalExpr}), 0), 2) AS valor_final_identificado,
              ROUND(IFNULL(SUM(valor_lote_final), 0), 2) AS valor_lote_identificado,
              ROUND(IFNULL(SUM(valor_global_final), 0), 2) AS valor_global_identificado
       FROM licitacoes_produtos
       WHERE ano = @ano
         AND IFNULL(fornecedor_nome, '') <> ''
       GROUP BY fornecedor_nome, fornecedor_cnpj
       ORDER BY produtos DESC, fornecedor_nome ASC
       LIMIT 8`
    )
    .all(yearParams);

  const modalidades = db
    .prepare(
      `SELECT IFNULL(modalidade, 'Nao identificada') AS modalidade,
              COUNT(*) AS produtos,
              COUNT(DISTINCT documento_id) AS licitacoes
       FROM licitacoes_produtos
       WHERE ano = @ano
       GROUP BY IFNULL(modalidade, 'Nao identificada')
       ORDER BY produtos DESC, modalidade ASC`
    )
    .all(yearParams);

  const origens = db
    .prepare(
      `SELECT origem, COUNT(*) AS produtos
       FROM licitacoes_produtos
       WHERE ano = @ano
       GROUP BY origem
       ORDER BY produtos DESC`
    )
    .all(yearParams);

  const validacoes = db
    .prepare(
      `SELECT v.status, COUNT(*) AS total
       FROM licitacoes_produtos_validacoes v
       JOIN licitacoes_produtos lp ON lp.id = v.produto_id
       WHERE lp.ano = @ano
       GROUP BY v.status
       ORDER BY total DESC`
    )
    .all(yearParams);

  const totalProdutos = produtos.total || 0;
  const lacunas = [
    {
      tipo: 'licitacoes_sem_produtos',
      label: 'Licitacoes sem produtos estruturados',
      total: Math.max(Number(licitacoesAno.total || 0) - Number(produtos.documentos_com_produtos || 0), 0)
    },
    {
      tipo: 'produtos_sem_preco_estimado',
      label: 'Produtos sem preco estimado',
      total: Math.max(totalProdutos - Number(produtos.com_preco_estimado || 0), 0)
    },
    {
      tipo: 'produtos_sem_preco_final',
      label: 'Produtos sem preco final',
      total: Math.max(totalProdutos - Number(produtos.com_preco_final || 0), 0)
    },
    {
      tipo: 'precos_finais_sem_total_calculavel',
      label: 'Precos finais sem total calculavel por quantidade',
      total: Math.max(
        Number(produtos.com_preco_final || 0) -
          Number(produtos.com_preco_final_calculavel || 0) -
          Number(produtos.com_valor_lote_final || 0) -
          Number(produtos.com_valor_global_final || 0),
        0
      )
    },
    {
      tipo: 'produtos_sem_fornecedor',
      label: 'Produtos sem fornecedor',
      total: Math.max(totalProdutos - Number(produtos.com_fornecedor || 0), 0)
    },
    {
      tipo: 'produtos_sem_validacao',
      label: 'Produtos pendentes de validacao de valores',
      total: produtos.sem_validacao || 0
    }
  ];

  return {
    filtros: {
      ano: selectedYear
    },
    licitacoes: licitacoesAno,
    produtos: {
      total: totalProdutos,
      documentos_com_produtos: produtos.documentos_com_produtos || 0,
      com_preco_estimado: produtos.com_preco_estimado || 0,
      com_preco_final: produtos.com_preco_final || 0,
      com_preco_final_calculavel: produtos.com_preco_final_calculavel || 0,
      com_valor_unitario_final: produtos.com_valor_unitario_final || 0,
      com_valor_total_final: produtos.com_valor_total_final || 0,
      com_valor_lote_final: produtos.com_valor_lote_final || 0,
      com_valor_global_final: produtos.com_valor_global_final || 0,
      com_fornecedor: produtos.com_fornecedor || 0,
      sem_validacao: produtos.sem_validacao || 0,
      valor_estimado_total_identificado: produtos.valor_estimado_total_identificado || 0,
      valor_final_total_identificado: produtos.valor_final_total_identificado || 0,
      valor_lote_total_identificado: produtos.valor_lote_total_identificado || 0,
      valor_global_total_identificado: produtos.valor_global_total_identificado || 0
    },
    modalidades,
    fornecedores,
    origens,
    validacoes,
    lacunas,
    produtos_recentes: listLicitacaoProdutos({
      ano: selectedYear,
      pagina: 1,
      limite: 8
    }).dados
  };
}

function listLicitacoesPorAnoStats() {
  const rows = db
    .prepare(
      `SELECT d.id, d.fonte, d.tipo, d.numero, d.ano, d.titulo, d.resumo,
              d.data_publicacao, d.data_abertura, d.valor_estimado,
              d.url_origem, d.url_pdf, d.hash_conteudo, d.status_coleta,
              d.dados_extras,
              d.coletado_em, d.atualizado_em,
              LENGTH(IFNULL(d.texto_completo, '')) AS texto_completo_chars,
              ld.modalidade, ld.status, ld.vencedor_nome, ld.vencedor_cnpj,
              ld.valor_final, ld.numero_pncp, ld.data_homologacao,
              ld.origem, ld.origem_detalhe, ld.trecho_fonte, ld.confianca,
              ld.atualizado_em AS detalhes_atualizado_em,
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
       LEFT JOIN licitacoes_detalhes ld ON ld.documento_id = d.id
       WHERE d.tipo = 'edital'`
    )
    .all()
    .map(normalizeLicitacao);

  const byYear = new Map();

  rows.forEach((item) => {
    const year = item.ano || 'sem_ano';
    if (!byYear.has(year)) {
      byYear.set(year, {
        ano: year,
        total: 0,
        com_data_sessao: 0,
        com_arquivo: 0,
        sem_arquivo: 0,
        sem_texto: 0,
        sem_data: 0,
        com_resumo_ai: 0,
        com_leitura_integrada: 0,
        com_grupo: 0,
        com_pncp: 0,
        com_valor_estimado: 0,
        com_valor_final: 0,
        com_vencedor: 0,
        valor_final_total: 0,
        com_ata: 0,
        com_contrato: 0,
        modalidades: {}
      });
    }

    const target = byYear.get(year);
    const modelo = item.licitacao_modelo || {};
    const modalidade = modelo.modalidade_nome || 'Nao identificada';

    target.total += 1;
    if (modelo.data_sessao) {target.com_data_sessao += 1;}
    if (item.url_pdf || modelo.anexos_total) {target.com_arquivo += 1;}
    if (!item.url_pdf && !modelo.anexos_total) {target.sem_arquivo += 1;}
    if (!item.texto_completo_chars) {target.sem_texto += 1;}
    if (!item.data_publicacao && !modelo.data_sessao) {target.sem_data += 1;}
    if (item.tem_resumo_ai) {target.com_resumo_ai += 1;}
    if (item.correlacao_resumo?.tem_leitura_integrada) {target.com_leitura_integrada += 1;}
    if (item.correlacao_resumo?.tem_grupo) {target.com_grupo += 1;}
    if (item.correlacao_resumo?.tem_pncp) {target.com_pncp += 1;}
    if (modelo.valor_estimado !== null) {target.com_valor_estimado += 1;}
    if (item.licitacao_detalhes?.valor_final !== null) {
      target.com_valor_final += 1;
      target.valor_final_total += Number(item.licitacao_detalhes.valor_final || 0);
    }
    if (item.licitacao_detalhes?.vencedor_nome || item.licitacao_detalhes?.vencedor_cnpj) {
      target.com_vencedor += 1;
    }
    if (modelo.tem_ata) {target.com_ata += 1;}
    if (modelo.tem_contrato) {target.com_contrato += 1;}
    target.modalidades[modalidade] = (target.modalidades[modalidade] || 0) + 1;
  });

  return Array.from(byYear.values())
    .map((item) => ({
      ...item,
      valor_final_total: Number(item.valor_final_total.toFixed(2)),
      modalidades: Object.entries(item.modalidades)
        .map(([modalidade, total]) => ({ modalidade, total }))
        .sort((a, b) => b.total - a.total || a.modalidade.localeCompare(b.modalidade))
    }))
    .sort((a, b) => {
      if (a.ano === 'sem_ano') {return 1;}
      if (b.ano === 'sem_ano') {return -1;}
      return Number(b.ano) - Number(a.ano);
    });
}

function parseDateForSort(value) {
  const text = cleanField(value);
  if (!text) {return 0;}

  const brDate = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (brDate) {
    const [, day, month, year] = brDate;
    return new Date(Number(year), Number(month) - 1, Number(day)).getTime();
  }

  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function compareLicitacoesRecentes(a, b) {
  const aDate = parseDateForSort(
    a.licitacao_modelo?.data_sessao || a.data_abertura || a.data_publicacao || a.atualizado_em
  );
  const bDate = parseDateForSort(
    b.licitacao_modelo?.data_sessao || b.data_abertura || b.data_publicacao || b.atualizado_em
  );

  if (aDate !== bDate) {return bDate - aDate;}
  return Number(b.id || 0) - Number(a.id || 0);
}

function normalizeLicitacao(row) {
  if (!row) {return null;}
  const documento = normalizeDocumento(row);
  const status = row.status || null;
  return {
    ...documento,
    licitacao_detalhes: {
      modalidade: row.modalidade || null,
      status,
      status_nome: labelStatus(status),
      vencedor_nome: row.vencedor_nome || null,
      vencedor_cnpj: row.vencedor_cnpj || null,
      valor_final: row.valor_final ?? null,
      numero_pncp: row.numero_pncp || null,
      data_homologacao: row.data_homologacao || null,
      origem: row.origem || row.detalhes_origem || null,
      origem_detalhe: row.origem_detalhe || row.detalhes_origem_detalhe || null,
      trecho_fonte: row.trecho_fonte || row.detalhes_trecho_fonte || null,
      confianca: row.confianca ?? row.detalhes_confianca ?? null,
      atualizado_em: row.detalhes_atualizado_em || null
    },
    licitacao_modelo: buildLicitacaoModelo(documento, row),
    produtos_licitados_resumo: getLicitacaoProdutosResumo(row.id),
    correlacao_resumo: {
      tem_grupo: Boolean(row.tem_grupo_licitacao),
      grupo_total_documentos: Number(row.grupo_total_documentos || 0),
      tem_pncp: Boolean(row.tem_pncp),
      pncp_fontes_total: Number(row.pncp_fontes_total || 0),
      tem_leitura_integrada: Boolean(row.tem_leitura_integrada)
    },
    categoria_inteligencia: row.categoria_inteligencia || null,
    categoria_confianca: row.categoria_confianca ?? null
  };
}

// normalizeResumoAi e normalizeResumoAiJob → movidos para ai-jobs-repo.js

function findDocumentoByIdentity(identity) {
  if (identity.urlPdf) {
    const byPdf = db
      .prepare('SELECT * FROM documentos WHERE url_pdf = ? LIMIT 1')
      .get(identity.urlPdf);
    if (byPdf) {return byPdf;}
  }

  if (identity.fonte === 'camara' || identity.fonte === 'site_prefeitura') {
    // url_origem da prefeitura é a página de listagem (igual para todos os
    // editais), então o match efetivo aqui é numero+ano+tipo. Processos
    // distintos podem dividir o mesmo número — a compatibilidade de títulos
    // impede a fusão indevida (ver titulosCompativeis).
    const candidates = db
      .prepare(
        `SELECT * FROM documentos
         WHERE fonte = @fonte
           AND url_origem = @urlOrigem
           AND IFNULL(numero, '') = IFNULL(@numero, '')
           AND IFNULL(ano, 0) = IFNULL(@ano, 0)
           AND tipo = @tipo`
      )
      .all({
        fonte: identity.fonte,
        urlOrigem: identity.urlOrigem,
        numero: identity.numero || null,
        ano: identity.ano || null,
        tipo: identity.tipo
      });

    const compativel = candidates.find((candidate) =>
      titulosCompativeis(identity.titulo, candidate.titulo)
    );
    if (compativel) {return compativel;}
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
  const numeroNormalizado = normalizarNumeroDocumento(documento.numero);
  const existing = findDocumentoByIdentity({
    fonte: documento.fonte,
    tipo: documento.tipo,
    numero: numeroNormalizado,
    ano: documento.ano,
    titulo: documento.titulo,
    urlOrigem: documento.url_origem,
    urlPdf: documento.url_pdf,
    hashConteudo: documento.hash_conteudo
  });

  const payload = {
    fonte: documento.fonte,
    tipo: documento.tipo,
    numero: numeroNormalizado,
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
        valor_final, numero_pncp, data_homologacao,
        origem, origem_detalhe, trecho_fonte, confianca, atualizado_em
      ) VALUES (
        @documento_id, @modalidade, @status, @vencedor_nome, @vencedor_cnpj,
        @valor_final, @numero_pncp, @data_homologacao,
        @origem, @origem_detalhe, @trecho_fonte, @confianca, @atualizado_em
      )
      ON CONFLICT(documento_id) DO UPDATE SET
        modalidade = COALESCE(excluded.modalidade, licitacoes_detalhes.modalidade),
        status = COALESCE(excluded.status, licitacoes_detalhes.status),
        vencedor_nome = COALESCE(excluded.vencedor_nome, licitacoes_detalhes.vencedor_nome),
        vencedor_cnpj = COALESCE(excluded.vencedor_cnpj, licitacoes_detalhes.vencedor_cnpj),
        valor_final = COALESCE(excluded.valor_final, licitacoes_detalhes.valor_final),
        numero_pncp = COALESCE(excluded.numero_pncp, licitacoes_detalhes.numero_pncp),
        data_homologacao = COALESCE(excluded.data_homologacao, licitacoes_detalhes.data_homologacao),
        origem = COALESCE(excluded.origem, licitacoes_detalhes.origem),
        origem_detalhe = COALESCE(excluded.origem_detalhe, licitacoes_detalhes.origem_detalhe),
        trecho_fonte = COALESCE(excluded.trecho_fonte, licitacoes_detalhes.trecho_fonte),
        confianca = COALESCE(excluded.confianca, licitacoes_detalhes.confianca),
        atualizado_em = excluded.atualizado_em`
    ).run({
      documento_id: result.id,
      modalidade: documento.licitacao_detalhes.modalidade || null,
      status: documento.licitacao_detalhes.status || null,
      vencedor_nome: documento.licitacao_detalhes.vencedor_nome || null,
      vencedor_cnpj: documento.licitacao_detalhes.vencedor_cnpj || null,
      valor_final: documento.licitacao_detalhes.valor_final ?? null,
      numero_pncp: documento.licitacao_detalhes.numero_pncp || null,
      data_homologacao: documento.licitacao_detalhes.data_homologacao || null,
      origem: documento.licitacao_detalhes.origem || null,
      origem_detalhe: documento.licitacao_detalhes.origem_detalhe || null,
      trecho_fonte: documento.licitacao_detalhes.trecho_fonte || null,
      confianca: documento.licitacao_detalhes.confianca ?? null,
      atualizado_em: now
    });
  }

  return result;
}

// createColetaLog, finishColetaLog → movidos para coletas-repo.js

// buildDocumentoWhere, listDocumentos, listAnosDocumentos → movidos para documentos-repo.js

function listLicitacoes({ fonte, ano, status, termo, categoria, fornecedor, pagina = 1, limite = 20 }) {
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

  if (categoria) {
    filters.push('EXISTS (SELECT 1 FROM licitacoes_categorias lc2 WHERE lc2.documento_id = d.id AND lc2.categoria = @categoria)');
    params.categoria = categoria;
  }

  if (fornecedor) {
    const fornClean = String(fornecedor).replace(/\D/g, '');
    if (fornClean.length === 14) {
      filters.push("(REPLACE(REPLACE(REPLACE(ld.vencedor_cnpj, '.', ''), '/', ''), '-', '') = @fornecedor OR ld.vencedor_cnpj = @fornecedor)");
      params.fornecedor = fornClean;
    } else {
      filters.push("ld.vencedor_nome LIKE @fornecedor");
      params.fornecedor = likeParam(fornecedor);
    }
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
              d.dados_extras,
              d.coletado_em, d.atualizado_em,
              LENGTH(IFNULL(d.texto_completo, '')) AS texto_completo_chars,
              ld.modalidade, ld.status, ld.vencedor_nome, ld.vencedor_cnpj,
              ld.valor_final, ld.numero_pncp, ld.data_homologacao,
              ld.origem, ld.origem_detalhe, ld.trecho_fonte, ld.confianca,
              ld.atualizado_em AS detalhes_atualizado_em,
              EXISTS (
                SELECT 1
                FROM documentos_resumos_ai rai
                WHERE rai.documento_id = d.id
                  AND rai.status = 'ok'
                  AND rai.contrato_versao NOT LIKE '2.%'
              ) AS tem_resumo_ai,
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
              ) AS tem_leitura_integrada,
              lc.categoria AS categoria_inteligencia,
              lc.confianca AS categoria_confianca
       FROM documentos d
       LEFT JOIN licitacoes_detalhes ld ON ld.documento_id = d.id
       LEFT JOIN licitacoes_categorias lc ON lc.documento_id = d.id
       ${whereClause}
       ORDER BY COALESCE(d.data_abertura, d.data_publicacao, d.atualizado_em) DESC, d.id DESC`
    )
    .all(params)
    .map(normalizeLicitacao)
    .sort(compareLicitacoesRecentes);

  return {
    total,
    pagina,
    limite,
    dados: rows.slice(offset, offset + limite)
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
  const licitacoesPorAno = listLicitacoesPorAnoStats();
  const currentYear = new Date().getFullYear();
  const licitacoesAnoCorrente =
    licitacoesPorAno.find((item) => Number(item.ano) === currentYear) ||
    licitacoesPorAno[0] ||
    null;

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
    })),
    licitacoes_por_ano: licitacoesPorAno,
    licitacoes_ano_corrente: licitacoesAnoCorrente
  };
}

function getPainelCidadao() {
  const estatisticas = getEstatisticas();
  const currentYear = new Date().getFullYear();
  const hasCurrentYear = estatisticas.por_ano.some((item) => Number(item.ano) === currentYear);
  const anoPadrao = hasCurrentYear ? currentYear : estatisticas.por_ano[0]?.ano;
  const recentes = listDocumentos({ pagina: 1, limite: 8 });
  const licitacoes = listLicitacoes({ ano: anoPadrao, pagina: 1, limite: 5 });
  const coletas = coletasRepo.listColetasLog(5).map((item) => ({
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
    licitacoes_ano_corrente: estatisticas.licitacoes_ano_corrente,
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
  if (!documento) {return null;}

  const textoCompletoChars = documento.texto_completo ? documento.texto_completo.length : 0;
  const fontes = db
    .prepare(
      `SELECT fonte, url_origem, url_pdf, hash_conteudo, coletado_em
       FROM documentos_fontes
       WHERE documento_id = ?
       ORDER BY coletado_em DESC`
    )
    .all(id);
  const licitacaoFontesRelacionadas =
    documento.tipo === 'edital' ? listLicitacaoFontesRelacionadasByDocumentoId(id) : [];
  const licitacaoGrupo =
    documento.tipo === 'edital' ? getLicitacaoGrupoByDocumentoId(id) : null;

  const licitacao = db
    .prepare('SELECT * FROM licitacoes_detalhes WHERE documento_id = ?')
    .get(id);
  const resumoAi = aiJobsRepo.getLatestResumoAiByDocumentoId(id);
  const leituraIntegradaAi =
    documento.tipo === 'edital' ? aiJobsRepo.getLatestLeituraIntegradaByDocumentoId(id) : null;
  const textoHashAtual = documento.texto_completo ? buildTextoHash(documento.texto_completo) : null;
  const resumoAiJob = textoHashAtual
    ? aiJobsRepo.getLatestResumoAiJobByDocumentoHash(id, textoHashAtual, config.aiContractVersion)
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
    licitacao_fontes_relacionadas: licitacaoFontesRelacionadas,
    licitacao_grupo: licitacaoGrupo,
    licitacao_detalhes: licitacao || null,
    licitacao_modelo: documento.tipo === 'edital' ? buildLicitacaoModelo(documento, licitacao || {}) : null,
    produtos_licitados_resumo: documento.tipo === 'edital' ? getLicitacaoProdutosResumo(documento.id) : null,
    resumo_ai_job: resumoAiJob,
    leitura_integrada_ai: leituraIntegradaAi
      ? {
          provider: leituraIntegradaAi.provider,
          modelo: leituraIntegradaAi.modelo,
          contrato_versao: leituraIntegradaAi.contrato_versao,
          criado_em: leituraIntegradaAi.criado_em,
          atualizado_em: leituraIntegradaAi.atualizado_em,
          texto_hash: leituraIntegradaAi.texto_hash,
          status: leituraIntegradaAi.status,
          dados: leituraIntegradaAi.resumo_json
        }
      : null,
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

// getResumoAiByDocumentoHash, getLatestResumoAiByDocumentoId,
// getLatestLeituraIntegradaByDocumentoId → movidos para ai-jobs-repo.js

/**
 * saveResumoAi permanece aqui porque chama estruturarProdutosDeResumoAi
 * (domínio licitações). Será migrado quando licitacoes-repo.js for criado.
 */
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

  const saved = aiJobsRepo.getResumoAiByDocumentoHash(documento_id, texto_hash, contrato_versao);
  if (!String(contrato_versao || '').startsWith('2.')) {
    estruturarProdutosDeResumoAi(documento_id, saved);
  }
  return saved;
}

// createResumoAiJob, getResumoAiJobById, getLatestResumoAiJobByDocumentoHash, getNextPendingResumoAiJob,
// listResumoAiJobs, getResumoAiJobsStats, recoverStaleResumoAiJobs, markResumoAiJobProcessing,
// finishResumoAiJobOk, finishResumoAiJobError, listDocumentosPendentesResumoAi, listDocumentosParaResumoAi,
// getResumoAiStatus, listResumoAnalises → movidos para ai-jobs-repo.js

// getDocumentoByUrlPdf, getDocumentoByUrlPdfRaw → movidos para documentos-repo.js

// Dossiê único de fornecedor: agrega licitado (produtos + vencedor) e pago
// (empenhos), unificando por CNPJ normalizado (14 dígitos) — os formatos mistos
// nas tabelas fragmentavam o mesmo CNPJ em perfis separados.
function consolidarFornecedores() {
  // Agrega via produtos
  const porProdutos = db
    .prepare(
      `SELECT
         fornecedor_cnpj AS cnpj,
         fornecedor_nome AS nome,
         COUNT(DISTINCT documento_id) AS n_licitacoes,
         COUNT(*) AS n_itens,
         SUM(COALESCE(valor_total_final, 0)) AS total_valor,
         GROUP_CONCAT(DISTINCT CAST(ano AS TEXT)) AS anos
       FROM licitacoes_produtos
       WHERE fornecedor_cnpj IS NOT NULL AND fornecedor_cnpj <> ''
       GROUP BY fornecedor_cnpj`
    )
    .all();

  // Agrega via detalhes (vencedores)
  const porDetalhes = db
    .prepare(
      `SELECT
         vencedor_cnpj AS cnpj,
         vencedor_nome AS nome,
         COUNT(DISTINCT documento_id) AS n_licitacoes,
         COUNT(*) AS n_vitorias,
         SUM(COALESCE(valor_final, 0)) AS total_valor,
         GROUP_CONCAT(DISTINCT CAST(d.ano AS TEXT)) AS anos
       FROM licitacoes_detalhes ld
       JOIN documentos d ON d.id = ld.documento_id
       WHERE vencedor_cnpj IS NOT NULL AND vencedor_cnpj <> ''
       GROUP BY vencedor_cnpj`
    )
    .all();

  // Agrega via empenhos (lado pago) — exclui folha de pagamento e tributos
  const porEmpenhos = db
    .prepare(
      `SELECT
         credor_cnpj AS cnpj,
         credor_nome AS nome,
         COUNT(*) AS n_empenhos,
         SUM(COALESCE(valor, 0)) AS total_valor,
         GROUP_CONCAT(DISTINCT CAST(exercicio_orcamento AS TEXT)) AS anos
       FROM transparencia_despesas
       WHERE credor_cnpj IS NOT NULL AND credor_cnpj <> ''
         AND UPPER(IFNULL(credor_nome, '')) NOT LIKE '%FOLHA%'
         AND UPPER(IFNULL(credor_nome, '')) NOT LIKE '%INSS%'
         AND UPPER(IFNULL(credor_nome, '')) NOT LIKE '%FGTS%'
         AND UPPER(IFNULL(credor_nome, '')) NOT LIKE '%PASEP%'
         AND UPPER(IFNULL(credor_nome, '')) NOT LIKE '%RECEITA FEDERAL%'
       GROUP BY credor_cnpj`
    )
    .all();

  const mapa = new Map();

  // Chave canônica = 14 dígitos; exibição = formatado. Acumula fragmentos.
  function obter(cnpjRaw, nome) {
    const chave = normalizarCnpj(cnpjRaw);
    if (!chave) {
      return null;
    }
    let perfil = mapa.get(chave);
    if (!perfil) {
      perfil = {
        cnpj: formatarCnpj(chave),
        nome_canonico: nome || null,
        total_valor_produtos: 0,
        total_valor_vencedor: 0,
        total_valor_pago: 0,
        n_itens_produtos: 0,
        n_vitorias: 0,
        n_empenhos: 0,
        n_licitacoes_produtos: 0,
        n_licitacoes_vencedor: 0,
        anos: new Set(),
        anosPago: new Set(),
      };
      mapa.set(chave, perfil);
    }
    return perfil;
  }

  for (const row of porProdutos) {
    const perfil = obter(row.cnpj, row.nome);
    if (!perfil) {
      continue;
    }
    perfil.total_valor_produtos += row.total_valor || 0;
    perfil.n_itens_produtos += row.n_itens || 0;
    perfil.n_licitacoes_produtos += row.n_licitacoes || 0;
    (row.anos || '').split(',').filter(Boolean).forEach((a) => perfil.anos.add(a));
  }

  for (const row of porDetalhes) {
    const perfil = obter(row.cnpj, row.nome);
    if (!perfil) {
      continue;
    }
    perfil.total_valor_vencedor += row.total_valor || 0;
    perfil.n_vitorias += row.n_vitorias || 0;
    perfil.n_licitacoes_vencedor += row.n_licitacoes || 0;
    (row.anos || '').split(',').filter(Boolean).forEach((a) => perfil.anos.add(a));
    // Prefere o nome do vencedor (geralmente mais limpo)
    if (row.nome) {perfil.nome_canonico = row.nome;}
  }

  for (const row of porEmpenhos) {
    const perfil = obter(row.cnpj, row.nome);
    if (!perfil) {
      continue;
    }
    perfil.total_valor_pago += row.total_valor || 0;
    perfil.n_empenhos += row.n_empenhos || 0;
    (row.anos || '').split(',').filter(Boolean).forEach((a) => perfil.anosPago.add(a));
    // nome de empenho só como último recurso (nomes do SH3 podem vir abreviados)
    if (!perfil.nome_canonico && row.nome) {perfil.nome_canonico = row.nome;}
  }

  // Limpa perfis antigos (chaves em formato inconsistente) antes de regravar
  db.prepare('DELETE FROM fornecedores_perfil').run();

  const upsert = db.prepare(`
    INSERT INTO fornecedores_perfil
      (cnpj, nome_canonico, total_valor_produtos, total_valor_vencedor, total_valor_pago,
       n_itens_produtos, n_vitorias, n_empenhos, n_licitacoes_produtos, n_licitacoes_vencedor,
       n_anos_pago, anos_ativos, atualizado_em)
    VALUES
      (@cnpj, @nome_canonico, @total_valor_produtos, @total_valor_vencedor, @total_valor_pago,
       @n_itens_produtos, @n_vitorias, @n_empenhos, @n_licitacoes_produtos, @n_licitacoes_vencedor,
       @n_anos_pago, @anos_ativos, CURRENT_TIMESTAMP)
    ON CONFLICT(cnpj) DO UPDATE SET
      nome_canonico = excluded.nome_canonico,
      total_valor_produtos = excluded.total_valor_produtos,
      total_valor_vencedor = excluded.total_valor_vencedor,
      total_valor_pago = excluded.total_valor_pago,
      n_itens_produtos = excluded.n_itens_produtos,
      n_vitorias = excluded.n_vitorias,
      n_empenhos = excluded.n_empenhos,
      n_licitacoes_produtos = excluded.n_licitacoes_produtos,
      n_licitacoes_vencedor = excluded.n_licitacoes_vencedor,
      n_anos_pago = excluded.n_anos_pago,
      anos_ativos = excluded.anos_ativos,
      atualizado_em = CURRENT_TIMESTAMP
  `);

  let salvos = 0;
  for (const [, perfil] of mapa) {
    const anos = Array.from(perfil.anos)
      .filter(Boolean)
      .sort()
      .reverse();
    upsert.run({
      cnpj: perfil.cnpj,
      nome_canonico: perfil.nome_canonico,
      total_valor_produtos: perfil.total_valor_produtos,
      total_valor_vencedor: perfil.total_valor_vencedor,
      total_valor_pago: perfil.total_valor_pago,
      n_itens_produtos: perfil.n_itens_produtos,
      n_vitorias: perfil.n_vitorias,
      n_empenhos: perfil.n_empenhos,
      n_licitacoes_produtos: perfil.n_licitacoes_produtos,
      n_licitacoes_vencedor: perfil.n_licitacoes_vencedor,
      n_anos_pago: perfil.anosPago.size,
      anos_ativos: JSON.stringify(anos)
    });
    salvos++;
  }

  return { total: mapa.size, salvos };
}

function getFornecedoresRanking({ limite = 20, ordem = 'valor' } = {}) {
  const ordemSql =
    ordem === 'vitorias'
      ? 'n_vitorias DESC, (total_valor_vencedor + total_valor_produtos) DESC'
      : '(total_valor_vencedor + total_valor_produtos) DESC, n_vitorias DESC';

  const rows = db
    .prepare(
      `SELECT
         cnpj,
         nome_canonico,
         total_valor_produtos,
         total_valor_vencedor,
         total_valor_pago,
         (total_valor_vencedor + total_valor_produtos) AS total_valor_combinado,
         n_itens_produtos,
         n_vitorias,
         n_empenhos,
         n_licitacoes_produtos,
         n_licitacoes_vencedor,
         n_anos_pago,
         anos_ativos,
         atualizado_em
       FROM fornecedores_perfil
       ORDER BY ${ordemSql}
       LIMIT @limite`
    )
    .all({ limite: Math.min(Math.max(Number(limite || 20), 1), 100) });

  return rows.map((row) => ({
    ...row,
    anos_ativos: parseJson(row.anos_ativos) || []
  }));
}

// Grupos de produtos com preço unitário em 2+ anos — base da comparação
// histórica de preços (3.3). Ordenado por amplitude temporal e volume.
function getProdutosGruposComparaveis({ limite = 50 } = {}) {
  return db
    .prepare(
      `SELECT g.id, g.rotulo_canonico, g.n_variacoes,
              COUNT(DISTINCT p.ano) AS n_anos,
              COUNT(*) AS n_itens,
              ROUND(MIN(p.valor_unitario_final), 2) AS preco_min,
              ROUND(MAX(p.valor_unitario_final), 2) AS preco_max,
              ROUND(AVG(p.valor_unitario_final), 2) AS preco_medio
         FROM produtos_grupos g
         JOIN licitacoes_produtos p ON p.grupo_id = g.id
        WHERE p.valor_unitario_final IS NOT NULL AND p.valor_unitario_final > 0 AND p.ano IS NOT NULL
        GROUP BY g.id
       HAVING n_anos >= 2
        ORDER BY n_anos DESC, n_itens DESC
        LIMIT @limite`
    )
    .all({ limite: Math.min(Math.max(Number(limite) || 50, 1), 200) });
}

// Série anual de preço unitário (média/mín/máx) de um grupo de produto.
function getEvolucaoPrecoGrupo(grupoId) {
  const grupo = db.prepare('SELECT id, rotulo_canonico, n_variacoes FROM produtos_grupos WHERE id = ?').get(Number(grupoId));
  if (!grupo) {return null;}

  const serie = db
    .prepare(
      `SELECT p.ano,
              ROUND(AVG(p.valor_unitario_final), 2) AS preco_medio,
              ROUND(MIN(p.valor_unitario_final), 2) AS preco_min,
              ROUND(MAX(p.valor_unitario_final), 2) AS preco_max,
              COUNT(*) AS n_itens
         FROM licitacoes_produtos p
        WHERE p.grupo_id = @grupoId AND p.valor_unitario_final IS NOT NULL
          AND p.valor_unitario_final > 0 AND p.ano IS NOT NULL
        GROUP BY p.ano
        ORDER BY p.ano`
    )
    .all({ grupoId: Number(grupoId) });

  const variacoes = db
    .prepare(
      `SELECT DISTINCT descricao_normalizada AS descricao
         FROM licitacoes_produtos WHERE grupo_id = ? ORDER BY descricao_normalizada`
    )
    .all(Number(grupoId))
    .map((r) => r.descricao);

  return { ...grupo, serie, variacoes };
}

function getInteligenciaPanorama() {
  const totalLicitacoes = db
    .prepare("SELECT COUNT(*) AS n FROM documentos WHERE tipo IN ('edital','publicacao_extrato')")
    .get().n;

  const valorVencedor = db
    .prepare("SELECT ROUND(COALESCE(SUM(valor_final),0),2) AS total FROM licitacoes_detalhes WHERE valor_final IS NOT NULL AND valor_final > 0")
    .get().total;

  const valorProdutos = db
    .prepare("SELECT ROUND(COALESCE(SUM(valor_total_final),0),2) AS total FROM licitacoes_produtos WHERE valor_total_final IS NOT NULL AND valor_total_final > 0 AND fornecedor_cnpj IS NOT NULL")
    .get().total;

  const nFornecedores = db
    .prepare("SELECT COUNT(*) AS n FROM fornecedores_perfil")
    .get().n;

  const nCategorias = db
    .prepare("SELECT COUNT(DISTINCT categoria) AS n FROM licitacoes_categorias WHERE categoria <> 'Outros'")
    .get().n;

  const comVencedor = db
    .prepare("SELECT COUNT(*) AS n FROM licitacoes_detalhes WHERE vencedor_nome IS NOT NULL AND vencedor_nome <> ''")
    .get().n;

  const semVencedor = totalLicitacoes - comVencedor;

  const semCnpjVencedor = db
    .prepare("SELECT COUNT(*) AS n FROM licitacoes_detalhes WHERE vencedor_nome IS NOT NULL AND vencedor_nome <> '' AND (vencedor_cnpj IS NULL OR vencedor_cnpj = '')")
    .get().n;

  const semValorVencedor = db
    .prepare("SELECT COUNT(*) AS n FROM licitacoes_detalhes WHERE vencedor_nome IS NOT NULL AND (valor_final IS NULL OR valor_final = 0)")
    .get().n;

  const porAno = db
    .prepare(`
      SELECT
        d.ano,
        COUNT(*) AS total_licitacoes,
        ROUND(COALESCE(SUM(d.valor_estimado), 0), 2) AS valor_estimado_total,
        ROUND(COALESCE(SUM(ld.valor_final), 0), 2) AS valor_final_total,
        COUNT(CASE WHEN ld.vencedor_nome IS NOT NULL AND ld.vencedor_nome <> '' THEN 1 END) AS com_vencedor,
        COUNT(CASE WHEN lc.categoria IS NOT NULL THEN 1 END) AS com_categoria
      FROM documentos d
      LEFT JOIN licitacoes_detalhes ld ON ld.documento_id = d.id
      LEFT JOIN licitacoes_categorias lc ON lc.documento_id = d.id
      WHERE d.tipo IN ('edital','publicacao_extrato') AND d.ano IS NOT NULL
      GROUP BY d.ano
      ORDER BY d.ano DESC
    `)
    .all();

  const porCategoria = db
    .prepare(`
      SELECT
        lc.categoria,
        COUNT(*) AS total,
        ROUND(COALESCE(SUM(ld.valor_final), 0), 2) AS valor_final_total,
        ROUND(COALESCE(SUM(d.valor_estimado), 0), 2) AS valor_estimado_total,
        COUNT(CASE WHEN ld.vencedor_nome IS NOT NULL AND ld.vencedor_nome <> '' THEN 1 END) AS com_vencedor
      FROM licitacoes_categorias lc
      JOIN documentos d ON d.id = lc.documento_id
      LEFT JOIN licitacoes_detalhes ld ON ld.documento_id = lc.documento_id
      GROUP BY lc.categoria
      ORDER BY total DESC
    `)
    .all();

  const fornecedoresTop = db
    .prepare(`
      SELECT cnpj, nome_canonico,
             (total_valor_vencedor + total_valor_produtos) AS total_valor_combinado,
             n_vitorias, n_itens_produtos, anos_ativos
      FROM fornecedores_perfil
      ORDER BY total_valor_combinado DESC
      LIMIT 8
    `)
    .all()
    .map((row) => ({ ...row, anos_ativos: parseJson(row.anos_ativos) || [] }));

  return {
    resumo: {
      total_licitacoes: totalLicitacoes,
      valor_vencedor_identificado: valorVencedor,
      valor_produtos_identificado: valorProdutos,
      n_fornecedores: nFornecedores,
      n_categorias: nCategorias,
      com_vencedor: comVencedor,
      sem_vencedor: semVencedor
    },
    alertas: {
      sem_vencedor: semVencedor,
      sem_cnpj_vencedor: semCnpjVencedor,
      sem_valor_vencedor: semValorVencedor
    },
    por_ano: porAno,
    por_categoria: porCategoria,
    fornecedores_top: fornecedoresTop
  };
}

function salvarCategoria({ documento_id, categoria, subcategoria, confianca, origem, keywords_matched }) {
  db.prepare(`
    INSERT INTO licitacoes_categorias
      (documento_id, categoria, subcategoria, confianca, origem, keywords_matched, atualizado_em)
    VALUES
      (@documento_id, @categoria, @subcategoria, @confianca, @origem, @keywords_matched, CURRENT_TIMESTAMP)
    ON CONFLICT(documento_id) DO UPDATE SET
      categoria = excluded.categoria,
      subcategoria = excluded.subcategoria,
      confianca = excluded.confianca,
      origem = excluded.origem,
      keywords_matched = excluded.keywords_matched,
      atualizado_em = CURRENT_TIMESTAMP
  `).run({
    documento_id,
    categoria,
    subcategoria: subcategoria || null,
    confianca: confianca || 0,
    origem: origem || 'keyword',
    keywords_matched: keywords_matched ? JSON.stringify(keywords_matched) : null
  });
}

function getCategoriasStats() {
  const porCategoria = db.prepare(`
    SELECT
      lc.categoria,
      COUNT(*) AS total,
      AVG(lc.confianca) AS confianca_media,
      COUNT(CASE WHEN lc.origem = 'keyword' THEN 1 END) AS por_keyword,
      COUNT(CASE WHEN lc.confianca < 0.5 THEN 1 END) AS baixa_confianca
    FROM licitacoes_categorias lc
    GROUP BY lc.categoria
    ORDER BY total DESC
  `).all();

  const total_classificados = db.prepare('SELECT COUNT(*) AS n FROM licitacoes_categorias').get().n;
  const total_editais = db.prepare("SELECT COUNT(*) AS n FROM documentos WHERE tipo = 'edital'").get().n;

  return {
    total_editais,
    total_classificados,
    pendentes: total_editais - total_classificados,
    por_categoria: porCategoria
  };
}

function listCategoriasDocumentos({ categoria, limite = 50, pagina = 1 } = {}) {
  const filters = [];
  const params = {};

  if (categoria) {
    filters.push('lc.categoria = @categoria');
    params.categoria = categoria;
  }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const offset = (Math.max(Number(pagina), 1) - 1) * Math.min(Number(limite), 100);
  params.limite = Math.min(Number(limite), 100);
  params.offset = offset;

  const total = db.prepare(`
    SELECT COUNT(*) AS n FROM licitacoes_categorias lc ${where}
  `).get(params).n;

  const dados = db.prepare(`
    SELECT
      d.id, d.titulo, d.ano, d.tipo, d.fonte, d.numero,
      d.data_publicacao, d.valor_estimado,
      lc.categoria, lc.subcategoria, lc.confianca, lc.origem
    FROM licitacoes_categorias lc
    JOIN documentos d ON d.id = lc.documento_id
    ${where}
    ORDER BY d.ano DESC, d.id DESC
    LIMIT @limite OFFSET @offset
  `).all(params);

  return { total, pagina: Number(pagina), limite: params.limite, dados };
}

function getCategoriasDocumentoId(documentoId) {
  const row = db.prepare('SELECT * FROM licitacoes_categorias WHERE documento_id = ?').get(documentoId);
  if (!row) {return null;}
  return { ...row, keywords_matched: parseJson(row.keywords_matched) || [] };
}

// Tipos de documento que são licitações (têm produtos/vencedor auditáveis)
const TIPOS_LICITACAO = ["'edital'", "'publicacao_extrato'"].join(',');

const AUDITORIA_SELECT = `
  SELECT
    d.id,
    d.titulo,
    d.tipo,
    d.ano,
    d.fonte,
    d.data_publicacao,
    CASE WHEN d.tipo IN (${TIPOS_LICITACAO}) THEN 1 ELSE 0 END AS e_licitacao,
    CASE WHEN IFNULL(d.texto_completo, '') <> '' THEN 1 ELSE 0 END AS tem_texto,
    CASE WHEN EXISTS (
      SELECT 1 FROM documentos_resumos_ai r
      WHERE r.documento_id = d.id AND r.status = 'ok' AND r.provider <> 'mock'
    ) THEN 1 ELSE 0 END AS tem_resumo_ai,
    CASE WHEN IFNULL(d.data_publicacao, '') <> '' THEN 1 ELSE 0 END AS tem_data,
    CASE WHEN IFNULL(d.url_pdf, '') <> '' AND d.status_coleta <> 'erro_pdf' THEN 1 ELSE 0 END AS tem_arquivo,
    CASE WHEN d.tipo IN (${TIPOS_LICITACAO}) AND EXISTS (
      SELECT 1 FROM licitacoes_produtos p WHERE p.documento_id = d.id
    ) THEN 1 ELSE 0 END AS tem_produtos,
    CASE WHEN d.tipo IN (${TIPOS_LICITACAO}) AND EXISTS (
      SELECT 1 FROM licitacoes_detalhes ld
      WHERE ld.documento_id = d.id AND ld.vencedor_nome IS NOT NULL AND ld.vencedor_nome <> ''
    ) THEN 1 ELSE 0 END AS tem_vencedor
  FROM documentos d
`;

function calcScore(row) {
  const base = row.tem_texto + row.tem_resumo_ai + row.tem_data + row.tem_arquivo;
  const extra = row.e_licitacao ? row.tem_produtos + row.tem_vencedor : 0;
  const max = row.e_licitacao ? 6 : 4;
  return Math.round(((base + extra) / max) * 100);
}

function getAuditoria({ ano, tipo, fonte } = {}) {
  const filters = [];
  const params = {};

  if (ano) {
    filters.push('d.ano = @ano');
    params.ano = Number(ano);
  }
  if (tipo) {
    filters.push('d.tipo = @tipo');
    params.tipo = tipo;
  }
  if (fonte) {
    filters.push('d.fonte = @fonte');
    params.fonte = fonte;
  }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const rows = db
    .prepare(`${AUDITORIA_SELECT} ${where} ORDER BY d.ano DESC, d.id DESC`)
    .all(params)
    .map((row) => ({ ...row, score: calcScore(row) }));

  const total = rows.length;
  if (total === 0) {
    return {
      filtros: { ano: ano ? Number(ano) : null, tipo: tipo || null, fonte: fonte || null },
      visao_geral: { total: 0, score_medio: 0, prontos: 0, criticos: 0 },
      por_faixa: [],
      lacunas: [],
      por_ano: [],
      por_tipo: [],
      piores: []
    };
  }

  const scoreTotal = rows.reduce((s, r) => s + r.score, 0);
  const prontos = rows.filter((r) => r.score >= 75).length;
  const criticos = rows.filter((r) => r.score <= 25).length;

  const faixas = { '0–25': 0, '26–50': 0, '51–75': 0, '76–100': 0 };
  for (const r of rows) {
    if (r.score <= 25) {faixas['0–25']++;}
    else if (r.score <= 50) {faixas['26–50']++;}
    else if (r.score <= 75) {faixas['51–75']++;}
    else {faixas['76–100']++;}
  }

  const camposLacuna = [
    { campo: 'texto_completo', key: 'tem_texto', label: 'Sem texto extraído', aplica: () => true },
    { campo: 'resumo_ia', key: 'tem_resumo_ai', label: 'Sem resumo IA (ok)', aplica: () => true },
    { campo: 'data_publicacao', key: 'tem_data', label: 'Sem data', aplica: () => true },
    { campo: 'arquivo_pdf', key: 'tem_arquivo', label: 'Sem arquivo ou com erro', aplica: () => true },
    { campo: 'produtos', key: 'tem_produtos', label: 'Sem produtos (licitações)', aplica: (r) => r.e_licitacao === 1 },
    { campo: 'vencedor', key: 'tem_vencedor', label: 'Sem vencedor (licitações)', aplica: (r) => r.e_licitacao === 1 }
  ];

  const lacunas = camposLacuna.map(({ campo, key, label, aplica }) => {
    const aplicaveis = rows.filter(aplica);
    const ausentes = aplicaveis.filter((r) => r[key] === 0).length;
    return {
      campo,
      label,
      ausentes,
      aplicaveis: aplicaveis.length,
      pct: aplicaveis.length > 0 ? (ausentes / aplicaveis.length) * 100 : 0
    };
  });

  const anosMap = new Map();
  for (const r of rows) {
    const k = r.ano || 0;
    if (!anosMap.has(k)) {anosMap.set(k, []);}
    anosMap.get(k).push(r.score);
  }
  const por_ano = Array.from(anosMap.entries())
    .map(([a, scores]) => ({
      ano: a || null,
      total: scores.length,
      score_medio: scores.reduce((s, v) => s + v, 0) / scores.length,
      prontos: scores.filter((s) => s >= 75).length,
      criticos: scores.filter((s) => s <= 25).length
    }))
    .sort((a, b) => (b.ano || 0) - (a.ano || 0));

  const tiposMap = new Map();
  for (const r of rows) {
    if (!tiposMap.has(r.tipo)) {tiposMap.set(r.tipo, []);}
    tiposMap.get(r.tipo).push(r.score);
  }
  const por_tipo = Array.from(tiposMap.entries())
    .map(([t, scores]) => ({
      tipo: t,
      total: scores.length,
      score_medio: scores.reduce((s, v) => s + v, 0) / scores.length,
      prontos: scores.filter((s) => s >= 75).length,
      criticos: scores.filter((s) => s <= 25).length
    }))
    .sort((a, b) => b.total - a.total);

  const piores = rows
    .filter((r) => r.score < 100)
    .sort((a, b) => a.score - b.score)
    .slice(0, 50)
    .map(({ resumo_json: _r, texto_completo: _t, ...rest }) => rest);

  return {
    filtros: { ano: ano ? Number(ano) : null, tipo: tipo || null, fonte: fonte || null },
    visao_geral: {
      total,
      score_medio: scoreTotal / total,
      prontos,
      criticos
    },
    por_faixa: Object.entries(faixas).map(([faixa, total_faixa]) => ({
      faixa,
      total: total_faixa,
      pct: (total_faixa / total) * 100
    })),
    lacunas,
    por_ano,
    por_tipo,
    piores
  };
}

// ── Re-exports de compatibilidade (Fase E) ────────────────────────────────────
// Novos repos especializados; importadores legados continuam usando './db/index'

module.exports = {
  db,
  // Funções locais (cross-domain — serão migradas progressivamente)
  saveDocumento,
  findDocumentoByIdentity,
  saveResumoAi,
  listLicitacoes,
  listLicitacaoProdutos,
  getLicitacaoProdutosByDocumentoId,
  getLicitacaoAnaliseAnual,
  estruturarProdutosLicitacoes,
  estruturarDetalhesLicitacoes,
  syncDocumentoAnexosLicitacao,
  listDocumentoAnexosParaExtracao,
  saveDocumentoAnexoTexto,
  listDocumentoAnexosTextoResultados,
  enriquecerProdutosComResultadosAnexo,
  validarProdutosLicitacoesValores,
  listLicitacoesParaDiagnosticoPncp,
  syncLicitacoesGrupos,
  getLicitacaoGrupoByDocumentoId,
  buildLicitacaoLeituraIntegradaPayload,
  listLicitacaoFontesRelacionadas,
  listLicitacaoFontesRelacionadasByDocumentoId,
  updateLicitacaoFonteRelacionadaStatus,
  upsertLicitacaoDetalhesExtraidos,
  upsertLicitacaoFonteRelacionada,
  getEstatisticas,
  getPainelCidadao,
  getDocumentoById,
  getAuditoria,
  getInteligenciaPanorama,
  salvarCategoria,
  getCategoriasStats,
  listCategoriasDocumentos,
  getCategoriasDocumentoId,
  consolidarFornecedores,
  getFornecedoresRanking,
  getProdutosGruposComparaveis,
  getEvolucaoPrecoGrupo,
  getDocumentoByNumeroPncp,
  upsertDadosPncp,
  // Re-exports de coletas-repo.js
  ...coletasRepo,
  // Re-exports de ai-jobs-repo.js
  ...aiJobsRepo,
  // Re-exports de documentos-repo.js
  ...documentosRepo,
};
