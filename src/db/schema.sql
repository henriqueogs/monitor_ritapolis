CREATE TABLE IF NOT EXISTS documentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fonte TEXT NOT NULL,
  tipo TEXT NOT NULL,
  numero TEXT,
  ano INTEGER,
  titulo TEXT NOT NULL,
  resumo TEXT,
  data_publicacao TEXT,
  data_abertura TEXT,
  valor_estimado REAL,
  url_origem TEXT NOT NULL,
  url_pdf TEXT,
  texto_completo TEXT,
  dados_extras TEXT,
  hash_conteudo TEXT,
  status_coleta TEXT DEFAULT 'ok',
  coletado_em TEXT DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS documentos_fontes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  documento_id INTEGER NOT NULL REFERENCES documentos(id) ON DELETE CASCADE,
  fonte TEXT NOT NULL,
  url_origem TEXT NOT NULL,
  url_pdf TEXT NOT NULL DEFAULT '',
  hash_conteudo TEXT,
  coletado_em TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (documento_id, fonte, url_origem, url_pdf)
);

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

CREATE TABLE IF NOT EXISTS documentos_anexos_resumos_ai (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  anexo_id INTEGER NOT NULL REFERENCES documentos_anexos(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  modelo TEXT NOT NULL,
  contrato_versao TEXT NOT NULL,
  resumo_json TEXT NOT NULL,
  texto_hash TEXT NOT NULL,
  tokens_estimados INTEGER,
  confianca REAL,
  status TEXT DEFAULT 'ok',
  erro TEXT,
  criado_em TEXT DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (anexo_id, texto_hash, contrato_versao)
);

-- Fila assíncrona de regeneração de resumo de anexo (mesmo padrão de
-- documentos_resumos_ai_jobs) — o botão "Regenerar" e a rotina em lote
-- enfileiram aqui; um worker em background processa um por vez.
CREATE TABLE IF NOT EXISTS documentos_anexos_resumos_ai_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  anexo_id INTEGER NOT NULL REFERENCES documentos_anexos(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  modelo TEXT NOT NULL,
  contrato_versao TEXT NOT NULL,
  texto_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente',
  force INTEGER NOT NULL DEFAULT 0,
  erro TEXT,
  resumo_ai_id INTEGER REFERENCES documentos_anexos_resumos_ai(id) ON DELETE SET NULL,
  tentativas INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT DEFAULT CURRENT_TIMESTAMP,
  iniciado_em TEXT,
  finalizado_em TEXT,
  atualizado_em TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inteligencia_fatos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  documento_id INTEGER NOT NULL REFERENCES documentos(id) ON DELETE CASCADE,
  anexo_id INTEGER REFERENCES documentos_anexos(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL,
  subtipo TEXT,
  descricao TEXT NOT NULL,
  quantidade REAL,
  unidade TEXT,
  valor REAL,
  data_evento TEXT,
  periodo_inicio TEXT,
  periodo_fim TEXT,
  local TEXT,
  ator TEXT,
  trecho_fonte TEXT,
  confianca REAL,
  origem TEXT NOT NULL,
  origem_hash TEXT NOT NULL UNIQUE,
  metadados_json TEXT,
  criado_em TEXT DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS licitacoes_detalhes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  documento_id INTEGER NOT NULL REFERENCES documentos(id) ON DELETE CASCADE,
  modalidade TEXT,
  status TEXT,
  vencedor_nome TEXT,
  vencedor_cnpj TEXT,
  valor_final REAL,
  numero_pncp TEXT,
  data_homologacao TEXT,
  origem TEXT,
  origem_detalhe TEXT,
  trecho_fonte TEXT,
  confianca REAL,
  atualizado_em TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (documento_id)
);

CREATE TABLE IF NOT EXISTS licitacoes_produtos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  documento_id INTEGER NOT NULL REFERENCES documentos(id) ON DELETE CASCADE,
  ano INTEGER,
  processo TEXT,
  modalidade TEXT,
  item_numero TEXT,
  lote_numero TEXT,
  descricao TEXT NOT NULL,
  descricao_normalizada TEXT,
  unidade TEXT,
  quantidade REAL,
  valor_unitario_estimado REAL,
  valor_total_estimado REAL,
  valor_unitario_final REAL,
  valor_total_final REAL,
  valor_final_tipo TEXT,
  valor_lote_final REAL,
  valor_global_final REAL,
  fornecedor_nome TEXT,
  fornecedor_cnpj TEXT,
  origem TEXT NOT NULL DEFAULT 'ia_resumo',
  origem_detalhe TEXT,
  trecho_fonte TEXT,
  resumo_ai_id INTEGER REFERENCES documentos_resumos_ai(id) ON DELETE SET NULL,
  confianca REAL,
  status_revisao TEXT NOT NULL DEFAULT 'pendente',
  grupo_id INTEGER REFERENCES produtos_grupos(id) ON DELETE SET NULL,
  hash_item TEXT NOT NULL,
  criado_em TEXT DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (documento_id, hash_item)
);

CREATE TABLE IF NOT EXISTS licitacoes_produtos_validacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  produto_id INTEGER NOT NULL REFERENCES licitacoes_produtos(id) ON DELETE CASCADE,
  fonte TEXT NOT NULL,
  sistema_origem TEXT,
  valor_encontrado REAL,
  campo_validado TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente',
  divergencia_abs REAL,
  divergencia_pct REAL,
  payload_json TEXT,
  validado_em TEXT DEFAULT CURRENT_TIMESTAMP
);

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

CREATE TABLE IF NOT EXISTS licitacoes_grupo_documentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  grupo_id INTEGER NOT NULL REFERENCES licitacoes_grupos(id) ON DELETE CASCADE,
  documento_id INTEGER NOT NULL REFERENCES documentos(id) ON DELETE CASCADE,
  papel TEXT NOT NULL DEFAULT 'publicacao',
  confianca REAL DEFAULT 1,
  criado_em TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (grupo_id, documento_id)
);

CREATE TABLE IF NOT EXISTS coletas_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fonte TEXT NOT NULL,
  inicio TEXT NOT NULL,
  fim TEXT,
  status TEXT,
  itens_novos INTEGER DEFAULT 0,
  itens_atualizados INTEGER DEFAULT 0,
  itens_com_erro INTEGER DEFAULT 0,
  detalhes TEXT
);

CREATE TABLE IF NOT EXISTS documentos_resumos_ai (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  documento_id INTEGER NOT NULL REFERENCES documentos(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  modelo TEXT NOT NULL,
  contrato_versao TEXT NOT NULL,
  resumo_json TEXT NOT NULL,
  texto_hash TEXT NOT NULL,
  tokens_estimados INTEGER,
  status TEXT DEFAULT 'ok',
  erro TEXT,
  criado_em TEXT DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (documento_id, texto_hash, contrato_versao)
);

CREATE TABLE IF NOT EXISTS documentos_resumos_ai_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  documento_id INTEGER NOT NULL REFERENCES documentos(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  modelo TEXT NOT NULL,
  contrato_versao TEXT NOT NULL,
  texto_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente',
  force INTEGER NOT NULL DEFAULT 0,
  erro TEXT,
  resumo_ai_id INTEGER REFERENCES documentos_resumos_ai(id) ON DELETE SET NULL,
  tentativas INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT DEFAULT CURRENT_TIMESTAMP,
  iniciado_em TEXT,
  finalizado_em TEXT,
  atualizado_em TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fornecedores_perfil (
  cnpj TEXT PRIMARY KEY,
  nome_canonico TEXT,
  total_valor_produtos REAL NOT NULL DEFAULT 0,
  total_valor_vencedor REAL NOT NULL DEFAULT 0,
  total_valor_pago REAL NOT NULL DEFAULT 0,
  n_itens_produtos INTEGER NOT NULL DEFAULT 0,
  n_vitorias INTEGER NOT NULL DEFAULT 0,
  n_empenhos INTEGER NOT NULL DEFAULT 0,
  n_licitacoes_produtos INTEGER NOT NULL DEFAULT 0,
  n_licitacoes_vencedor INTEGER NOT NULL DEFAULT 0,
  n_anos_pago INTEGER NOT NULL DEFAULT 0,
  anos_ativos TEXT,
  atualizado_em TEXT DEFAULT CURRENT_TIMESTAMP
);

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
);

CREATE TABLE IF NOT EXISTS transparencia_despesas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  documento_id INTEGER REFERENCES documentos(id) ON DELETE SET NULL,
  exercicio_orcamento INTEGER NOT NULL,
  empenho TEXT NOT NULL,
  tipo TEXT,
  data_empenho TEXT,
  data_liquidacao TEXT,
  data_pagamento TEXT,
  credor_nome TEXT,
  credor_cnpj TEXT,
  valor REAL NOT NULL DEFAULT 0,
  unidade TEXT,
  funcao TEXT,
  subfuncao TEXT,
  programa TEXT,
  projeto_atividade TEXT,
  categoria_economica TEXT,
  fonte_recurso TEXT,
  historico TEXT,
  licitacao_ref TEXT,
  modalidade TEXT,
  dados_extras TEXT,
  hash_despesa TEXT NOT NULL,
  coletado_em TEXT DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (exercicio_orcamento, empenho)
);

CREATE TABLE IF NOT EXISTS transparencia_receitas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exercicio INTEGER NOT NULL,
  codigo_receita TEXT NOT NULL,
  nome_receita TEXT,
  tipo_conta TEXT,
  valor_previsto REAL NOT NULL DEFAULT 0,
  coletado_em TEXT DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (exercicio, codigo_receita)
);

CREATE TABLE IF NOT EXISTS produtos_grupos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rotulo_canonico TEXT NOT NULL,
  n_itens INTEGER NOT NULL DEFAULT 0,
  n_variacoes INTEGER NOT NULL DEFAULT 0,
  metodo TEXT NOT NULL DEFAULT 'embeddings',
  criado_em TEXT DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transparencia_coletas_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fonte TEXT NOT NULL DEFAULT 'portal_transparencia',
  tipo TEXT NOT NULL,
  exercicio INTEGER NOT NULL,
  mes INTEGER,
  registros INTEGER NOT NULL DEFAULT 0,
  novos INTEGER NOT NULL DEFAULT 0,
  atualizados INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ok',
  erro TEXT,
  coletado_em TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tipo, exercicio, mes)
);

CREATE INDEX IF NOT EXISTS idx_documentos_fonte ON documentos(fonte);
CREATE INDEX IF NOT EXISTS idx_documentos_tipo ON documentos(tipo);
CREATE INDEX IF NOT EXISTS idx_documentos_data_publicacao ON documentos(data_publicacao);
CREATE INDEX IF NOT EXISTS idx_documentos_url_pdf ON documentos(url_pdf);
CREATE INDEX IF NOT EXISTS idx_documentos_numero_ano ON documentos(numero, ano);
CREATE INDEX IF NOT EXISTS idx_documentos_anexos_documento_id ON documentos_anexos(documento_id);
CREATE INDEX IF NOT EXISTS idx_documentos_anexos_tipo ON documentos_anexos(tipo);
CREATE INDEX IF NOT EXISTS idx_documentos_anexos_status ON documentos_anexos(status_extracao);
CREATE INDEX IF NOT EXISTS idx_anexos_resumos_anexo ON documentos_anexos_resumos_ai(anexo_id);
CREATE INDEX IF NOT EXISTS idx_anexos_resumos_status ON documentos_anexos_resumos_ai(status);
CREATE INDEX IF NOT EXISTS idx_anexos_resumos_ai_jobs_anexo_hash
  ON documentos_anexos_resumos_ai_jobs(anexo_id, texto_hash, contrato_versao, status);
CREATE INDEX IF NOT EXISTS idx_anexos_resumos_ai_jobs_status
  ON documentos_anexos_resumos_ai_jobs(status, atualizado_em);
CREATE INDEX IF NOT EXISTS idx_inteligencia_fatos_doc ON inteligencia_fatos(documento_id);
CREATE INDEX IF NOT EXISTS idx_inteligencia_fatos_anexo ON inteligencia_fatos(anexo_id);
CREATE INDEX IF NOT EXISTS idx_inteligencia_fatos_tipo ON inteligencia_fatos(tipo, subtipo);
CREATE INDEX IF NOT EXISTS idx_inteligencia_fatos_periodo ON inteligencia_fatos(periodo_inicio, periodo_fim, data_evento);
CREATE INDEX IF NOT EXISTS idx_licitacoes_detalhes_origem ON licitacoes_detalhes(origem);
CREATE INDEX IF NOT EXISTS idx_licitacoes_produtos_documento_id ON licitacoes_produtos(documento_id);
CREATE INDEX IF NOT EXISTS idx_licitacoes_produtos_ano ON licitacoes_produtos(ano);
CREATE INDEX IF NOT EXISTS idx_licitacoes_produtos_descricao_normalizada ON licitacoes_produtos(descricao_normalizada);
CREATE INDEX IF NOT EXISTS idx_licitacoes_produtos_origem ON licitacoes_produtos(origem);
CREATE INDEX IF NOT EXISTS idx_licitacoes_produtos_status_revisao ON licitacoes_produtos(status_revisao);
CREATE INDEX IF NOT EXISTS idx_licitacoes_produtos_validacoes_produto_id ON licitacoes_produtos_validacoes(produto_id);
CREATE INDEX IF NOT EXISTS idx_licitacoes_produtos_validacoes_status ON licitacoes_produtos_validacoes(status);
CREATE INDEX IF NOT EXISTS idx_licitacoes_fontes_relacionadas_documento_id ON licitacoes_fontes_relacionadas(documento_id);
CREATE INDEX IF NOT EXISTS idx_licitacoes_fontes_relacionadas_fonte ON licitacoes_fontes_relacionadas(fonte);
CREATE INDEX IF NOT EXISTS idx_licitacoes_fontes_relacionadas_status ON licitacoes_fontes_relacionadas(status_correspondencia);
CREATE INDEX IF NOT EXISTS idx_licitacoes_grupos_ano ON licitacoes_grupos(ano);
CREATE INDEX IF NOT EXISTS idx_licitacoes_grupos_processo ON licitacoes_grupos(processo_chave);
CREATE INDEX IF NOT EXISTS idx_licitacoes_grupo_documentos_grupo_id ON licitacoes_grupo_documentos(grupo_id);
CREATE INDEX IF NOT EXISTS idx_licitacoes_grupo_documentos_documento_id ON licitacoes_grupo_documentos(documento_id);
CREATE INDEX IF NOT EXISTS idx_resumos_ai_documento_id ON documentos_resumos_ai(documento_id);
CREATE INDEX IF NOT EXISTS idx_resumos_ai_texto_hash ON documentos_resumos_ai(texto_hash);
CREATE INDEX IF NOT EXISTS idx_resumos_ai_jobs_documento_hash
  ON documentos_resumos_ai_jobs(documento_id, texto_hash, contrato_versao, status);
CREATE INDEX IF NOT EXISTS idx_resumos_ai_jobs_status
  ON documentos_resumos_ai_jobs(status, atualizado_em);
CREATE INDEX IF NOT EXISTS idx_licitacoes_categorias_documento ON licitacoes_categorias(documento_id);
CREATE INDEX IF NOT EXISTS idx_licitacoes_categorias_categoria ON licitacoes_categorias(categoria);
CREATE INDEX IF NOT EXISTS idx_transp_despesas_exercicio ON transparencia_despesas(exercicio_orcamento);
CREATE INDEX IF NOT EXISTS idx_transp_despesas_empenho ON transparencia_despesas(empenho);
CREATE INDEX IF NOT EXISTS idx_transp_despesas_credor_cnpj ON transparencia_despesas(credor_cnpj);
CREATE INDEX IF NOT EXISTS idx_transp_despesas_data_empenho ON transparencia_despesas(data_empenho);
CREATE INDEX IF NOT EXISTS idx_transp_despesas_licitacao_ref ON transparencia_despesas(licitacao_ref);
CREATE INDEX IF NOT EXISTS idx_transp_despesas_documento_id ON transparencia_despesas(documento_id);
CREATE INDEX IF NOT EXISTS idx_transp_receitas_exercicio ON transparencia_receitas(exercicio);
CREATE INDEX IF NOT EXISTS idx_licitacoes_produtos_grupo_id ON licitacoes_produtos(grupo_id);


-- FTS5 — Busca textual nos documentos
-- Tabela de conteúdo (content table) — FTS sincroniza com documentos via triggers
CREATE VIRTUAL TABLE IF NOT EXISTS documentos_fts USING fts5(
  titulo,
  resumo,
  texto_completo,
  content='documentos',
  content_rowid='id',
  tokenize='unicode61 remove_diacritics 2'
);

-- Triggers para manter o índice FTS atualizado automaticamente
CREATE TRIGGER IF NOT EXISTS documentos_fts_ai AFTER INSERT ON documentos BEGIN
  INSERT INTO documentos_fts(rowid, titulo, resumo, texto_completo)
  VALUES (new.id, new.titulo, new.resumo, new.texto_completo);
END;

CREATE TRIGGER IF NOT EXISTS documentos_fts_ad AFTER DELETE ON documentos BEGIN
  INSERT INTO documentos_fts(documentos_fts, rowid, titulo, resumo, texto_completo)
  VALUES ('delete', old.id, old.titulo, old.resumo, old.texto_completo);
END;

CREATE TRIGGER IF NOT EXISTS documentos_fts_au AFTER UPDATE ON documentos BEGIN
  INSERT INTO documentos_fts(documentos_fts, rowid, titulo, resumo, texto_completo)
  VALUES ('delete', old.id, old.titulo, old.resumo, old.texto_completo);
  INSERT INTO documentos_fts(rowid, titulo, resumo, texto_completo)
  VALUES (new.id, new.titulo, new.resumo, new.texto_completo);
END;

-- Tabela de detalhes estruturados de emendas parlamentares
-- Referencia documentos WHERE tipo = 'emenda_parlamentar'
-- Campos extraidos pelo parser src/parsers/emenda-parlamentar.js
CREATE TABLE IF NOT EXISTS emendas_detalhes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  documento_id INTEGER NOT NULL REFERENCES documentos(id) ON DELETE CASCADE,
  esfera TEXT,                    -- 'estadual' | 'federal'
  numero_emenda TEXT,
  nome_parlamentar TEXT,
  cargo_parlamentar TEXT,
  partido TEXT,
  tipo_emenda TEXT,               -- 'Individual' | 'Bancada'
  tipo_transferencia TEXT,
  objeto TEXT,
  objeto_detalhado TEXT,
  valor_repasse REAL,
  valor_repasse_raw TEXT,
  valor_contrapartida REAL,
  orgao_transferidor TEXT,
  instrumento_legal TEXT,
  categoria_economica TEXT,
  unidade_executora TEXT,
  gestor_responsavel TEXT,
  data_inicio TEXT,               -- ISO YYYY-MM-DD
  data_termino TEXT,
  data_recebimento TEXT,
  dados_despesa TEXT,
  atualizado_em TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (documento_id)
);

CREATE INDEX IF NOT EXISTS idx_emendas_detalhes_esfera ON emendas_detalhes(esfera);
CREATE INDEX IF NOT EXISTS idx_emendas_detalhes_parlamentar ON emendas_detalhes(nome_parlamentar);
CREATE INDEX IF NOT EXISTS idx_emendas_detalhes_partido ON emendas_detalhes(partido);

-- ── Alertas de Inteligência (insights recorrentes sobre os resumos IA) ──────────
CREATE TABLE IF NOT EXISTS alertas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL,                          -- 'tematico' | 'processo'
  categoria TEXT,
  subcategoria TEXT,
  severidade TEXT NOT NULL DEFAULT 'info',     -- 'info' | 'atencao' | 'critico'
  titulo TEXT NOT NULL,
  narrativa TEXT,
  metadados_json TEXT,
  periodo_inicio TEXT,
  periodo_fim TEXT,
  valor_total REAL,
  valor_periodo_label TEXT,
  documentos_ids_json TEXT,
  questionamentos_json TEXT,
  confianca REAL,
  status TEXT NOT NULL DEFAULT 'ativo',         -- 'ativo' | 'arquivado' | 'suprimido'
  chave_unica TEXT NOT NULL UNIQUE,
  ultima_publicacao_documento TEXT,
  criado_em TEXT DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_alertas_status_pub ON alertas(status, ultima_publicacao_documento DESC);
CREATE INDEX IF NOT EXISTS idx_alertas_categoria ON alertas(categoria, severidade);

CREATE TABLE IF NOT EXISTS alertas_documentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alerta_id INTEGER NOT NULL REFERENCES alertas(id) ON DELETE CASCADE,
  documento_id INTEGER NOT NULL REFERENCES documentos(id) ON DELETE CASCADE,
  papel TEXT NOT NULL DEFAULT 'relacionado',
  trecho_fonte TEXT,
  UNIQUE (alerta_id, documento_id)
);

CREATE INDEX IF NOT EXISTS idx_alertas_documentos_doc ON alertas_documentos(documento_id);

CREATE TABLE IF NOT EXISTS alertas_evidencias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alerta_id INTEGER NOT NULL REFERENCES alertas(id) ON DELETE CASCADE,
  documento_id INTEGER REFERENCES documentos(id) ON DELETE CASCADE,
  anexo_id INTEGER REFERENCES documentos_anexos(id) ON DELETE SET NULL,
  fato_id INTEGER REFERENCES inteligencia_fatos(id) ON DELETE SET NULL,
  papel TEXT NOT NULL DEFAULT 'evidencia',
  trecho_fonte TEXT,
  metadados_json TEXT,
  evidencia_hash TEXT NOT NULL,
  criado_em TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (alerta_id, evidencia_hash)
);

CREATE INDEX IF NOT EXISTS idx_alertas_evidencias_alerta ON alertas_evidencias(alerta_id);
CREATE INDEX IF NOT EXISTS idx_alertas_evidencias_fato ON alertas_evidencias(fato_id);
CREATE INDEX IF NOT EXISTS idx_alertas_evidencias_anexo ON alertas_evidencias(anexo_id);

CREATE TABLE IF NOT EXISTS alertas_watermark (
  chave TEXT PRIMARY KEY,
  ultimo_processado_em TEXT,
  total_gerados INTEGER DEFAULT 0,
  atualizado_em TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS alertas_config (
  chave TEXT PRIMARY KEY,
  valor_json TEXT NOT NULL,
  descricao TEXT,
  editavel INTEGER NOT NULL DEFAULT 1,
  atualizado_em TEXT DEFAULT CURRENT_TIMESTAMP
);
