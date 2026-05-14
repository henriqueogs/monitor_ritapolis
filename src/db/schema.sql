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
  UNIQUE (documento_id)
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

CREATE INDEX IF NOT EXISTS idx_documentos_fonte ON documentos(fonte);
CREATE INDEX IF NOT EXISTS idx_documentos_tipo ON documentos(tipo);
CREATE INDEX IF NOT EXISTS idx_documentos_data_publicacao ON documentos(data_publicacao);
CREATE INDEX IF NOT EXISTS idx_documentos_url_pdf ON documentos(url_pdf);
CREATE INDEX IF NOT EXISTS idx_documentos_numero_ano ON documentos(numero, ano);
CREATE INDEX IF NOT EXISTS idx_resumos_ai_documento_id ON documentos_resumos_ai(documento_id);
CREATE INDEX IF NOT EXISTS idx_resumos_ai_texto_hash ON documentos_resumos_ai(texto_hash);
CREATE INDEX IF NOT EXISTS idx_resumos_ai_jobs_documento_hash
  ON documentos_resumos_ai_jobs(documento_id, texto_hash, contrato_versao, status);
CREATE INDEX IF NOT EXISTS idx_resumos_ai_jobs_status
  ON documentos_resumos_ai_jobs(status, atualizado_em);
