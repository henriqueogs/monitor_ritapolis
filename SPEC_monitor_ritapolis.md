# Monitor Ritápolis — Especificação Técnica do MVP

> Sistema de coleta, estruturação e visualização de dados públicos da
> Prefeitura Municipal de Ritápolis/MG para a população.

---

## Status do documento

Este documento e uma especificacao historica do MVP original. Em 2026-05-13, o estado atual e o roadmap vivo do projeto ficam em `DEVELOPMENT_PLAN.md`.

---

## 1. Visão Geral

### Objetivo

Construir um sistema automatizado que coleta dados públicos de múltiplas
fontes da Prefeitura de Ritápolis/MG, armazena em banco de dados
estruturado, e os apresenta ao cidadão comum através de uma interface
simples, pesquisável e atualizada automaticamente.

### Premissas fundamentais

- **Fidelidade total aos dados originais.** Nenhum dado é inventado ou
  inferido sem fonte explícita. Cada registro deve ter `url_origem`
  rastreável.
- **MVP funcional antes de completo.** Cada etapa entrega valor
  independente. O sistema funciona parcialmente enquanto novas fontes são
  adicionadas.
- **Zero dependência de login/autenticação.** Todas as fontes são públicas
  e acessíveis sem credenciais.
- **Detecção de mudanças.** Usar hash do conteúdo para identificar
  documentos novos ou alterados sem re-processar tudo.

---

## 2. Informações do Município

| Campo | Valor |
|---|---|
| Município | Ritápolis |
| Estado | Minas Gerais |
| Código IBGE | 3156106 |
| CNPJ Prefeitura | 18.557.553/0001-05 |
| CNPJ Câmara Municipal | 26.148.056/0001-81 |
| População estimada | ~5.122 habitantes |

---

## 3. Fontes de Dados

### 3.1 Site Oficial da Prefeitura

- **URL base:** `https://ritapolis.mg.gov.br`
- **Página de editais:** `https://ritapolis.mg.gov.br/pagina/6668/Editais`
- **Padrão de PDFs:** `https://ritapolis.mg.gov.br/Dados/doc_YYYYMMDDHHMMSS.pdf`
- **Tecnologia:** HTML server-side (ASP.NET), sem JavaScript necessário
  para renderizar conteúdo
- **Conteúdo disponível:**
  - Editais de licitação
  - Decretos do executivo
  - Portarias
  - Leis municipais
  - Processos seletivos / concursos
  - Notícias institucionais
- **Estratégia de coleta:** `axios` + `cheerio` para HTML; `pdf-parse`
  para extração de texto dos PDFs

### 3.2 Portal de Transparência da Prefeitura

- **URL base:** `http://pt.ritapolis.mg.gov.br`
- **Sistema:** SH3 Informática (ASP.NET)
- **Endpoints relevantes a explorar:**
  - `/Licitacao/BuscarLista?ano=2025&pagina=1&quantidade=50`
  - `/Despesa/BuscarLista?ano=2025&pagina=1&quantidade=50`
  - `/Receita/BuscarLista?ano=2025&pagina=1&quantidade=50`
  - `/Contrato/BuscarLista?ano=2025&pagina=1&quantidade=50`
  - `/FolhaDePagamento/BuscarLista?ano=2025&mes=1`
- **Conteúdo disponível:**
  - Licitações com status (aberta, homologada, deserta)
  - Contratos e aditivos
  - Despesas empenhadas, liquidadas e pagas
  - Receitas arrecadadas
  - Folha de pagamento por servidor
  - Obras públicas
- **Observação:** Pode retornar JSON ou HTML dependendo do endpoint.
  Testar `Content-Type` da resposta e tratar os dois casos.

### 3.3 Portal da Câmara Municipal

- **URL base:** `http://pt.ritapolis.mg.leg.br`
- **Sistema:** SH3 Informática (mesmo sistema do portal da prefeitura)
- **Conteúdo disponível:**
  - Leis municipais aprovadas
  - Projetos de lei em tramitação
  - Decretos legislativos
  - Resoluções
  - Portarias da mesa diretora
  - Atas de sessão
  - Licitações da Câmara
  - Folha de pagamento dos servidores da Câmara
- **Estratégia:** Mesma do portal de transparência (SH3 é o mesmo sistema)

### 3.4 PNCP — Portal Nacional de Contratações Públicas

- **URL base da API:** `https://pncp.gov.br/api/consulta/v1`
- **Documentação:** `https://pncp.gov.br/api/consulta/swagger-ui/index.html`
- **Autenticação:** Nenhuma (API pública)
- **Endpoints principais:**
  ```
  GET /contratacoes/publicacao
    ?dataInicial=20250101
    &dataFinal=20251231
    &codigoMunicipioIbge=3156106
    &uf=MG
    &tamanhoPagina=50
    &pagina=1

  GET /contratos
    ?dataInicial=20250101
    &dataFinal=20251231
    &codigoMunicipioIbge=3156106
    &uf=MG
    &tamanhoPagina=50
    &pagina=1
  ```
- **Resposta:** JSON com paginação. Campo `totalRegistros` indica total.
- **Obrigatoriedade legal:** Toda licitação pública pós-Lei 14.133/2021
  deve ser publicada aqui. É a fonte mais confiável para licitações.
- **Arquivos do edital:**
  ```
  GET /pncp-api/v1/orgaos/{cnpj}/compras/{ano}/{sequencial}/arquivos
  ```

---

## 4. Stack Tecnológica

### Backend / Coletor

```
Node.js >= 18
├── axios           — requisições HTTP
├── cheerio         — parsing de HTML (jQuery-like)
├── pdf-parse       — extração de texto de PDFs
├── better-sqlite3  — banco de dados SQLite (MVP)
├── node-cron       — agendamento de coletas
├── express         — API REST
└── winston         — logging estruturado
```

### Frontend

```
Next.js 14 (App Router)
├── Tailwind CSS    — estilização
├── shadcn/ui       — componentes base
└── recharts        — gráficos e visualizações
```

### Infraestrutura (MVP)

```
SQLite → arquivo local ritapolis.db
         (migrar para PostgreSQL em produção)
```

---

## 5. Estrutura de Pastas do Projeto

```
ritapolis-monitor/
├── README.md
├── package.json
├── .env.example
│
├── src/
│   ├── db/
│   │   ├── schema.sql          — definição das tabelas
│   │   ├── setup.js            — cria banco e tabelas
│   │   └── index.js            — conexão e helpers
│   │
│   ├── coletores/
│   │   ├── base.js             — classe base com retry, logging, hash
│   │   ├── site-prefeitura.js  — scraper do site oficial
│   │   ├── transparencia.js    — scraper do portal de transparência
│   │   ├── camara.js           — scraper da câmara
│   │   └── pncp.js             — cliente da API do PNCP
│   │
│   ├── parsers/
│   │   ├── pdf.js              — extração e normalização de texto de PDF
│   │   ├── licitacao.js        — identifica campos em texto de editais
│   │   └── decreto.js          — identifica campos em decretos/portarias
│   │
│   ├── api/
│   │   ├── server.js           — Express app
│   │   └── routes/
│   │       ├── documentos.js
│   │       ├── licitacoes.js
│   │       ├── estatisticas.js
│   │       └── busca.js
│   │
│   └── scheduler.js            — orquestração com node-cron
│
├── frontend/                   — Next.js app
│   ├── app/
│   │   ├── page.js             — página inicial (dashboard)
│   │   ├── licitacoes/page.js
│   │   ├── leis/page.js
│   │   ├── decretos/page.js
│   │   └── documento/[id]/page.js
│   └── components/
│       ├── DocumentCard.jsx
│       ├── SearchBar.jsx
│       ├── FilterBar.jsx
│       └── StatCard.jsx
│
└── scripts/
    ├── setup-db.js             — inicializa banco
    ├── coletar-agora.js        — dispara coleta manual
    └── migrar-postgres.js      — script de migração futura
```

---

## 6. Schema do Banco de Dados

```sql
-- Tabela principal de documentos
CREATE TABLE IF NOT EXISTS documentos (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  fonte             TEXT NOT NULL,        -- 'site_prefeitura' | 'transparencia' | 'camara' | 'pncp'
  tipo              TEXT NOT NULL,        -- 'edital' | 'decreto' | 'portaria' | 'lei' | 'contrato' | 'despesa'
  numero            TEXT,                 -- ex: '015/2025'
  ano               INTEGER,
  titulo            TEXT NOT NULL,
  resumo            TEXT,                 -- gerado a partir do texto extraído
  data_publicacao   TEXT,                 -- ISO 8601
  data_abertura     TEXT,                 -- para licitações
  valor_estimado    REAL,
  url_origem        TEXT NOT NULL,        -- URL da página onde foi encontrado
  url_pdf           TEXT,                 -- URL direta do PDF se existir
  texto_completo    TEXT,                 -- conteúdo extraído do PDF
  dados_extras      TEXT,                 -- JSON com campos específicos do tipo
  hash_conteudo     TEXT,                 -- SHA256 do conteúdo para detectar mudanças
  status_coleta     TEXT DEFAULT 'ok',    -- 'ok' | 'erro_pdf' | 'sem_pdf'
  coletado_em       TEXT DEFAULT (datetime('now')),
  atualizado_em     TEXT DEFAULT (datetime('now'))
);

-- Detalhes específicos de licitações
CREATE TABLE IF NOT EXISTS licitacoes_detalhes (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  documento_id      INTEGER REFERENCES documentos(id),
  modalidade        TEXT,   -- 'Pregão Eletrônico' | 'Pregão Presencial' | 'Dispensa' | 'Inexigibilidade' | 'Adesão'
  status            TEXT,   -- 'aberta' | 'homologada' | 'deserta' | 'revogada' | 'suspensa'
  vencedor_nome     TEXT,
  vencedor_cnpj     TEXT,
  valor_final       REAL,
  numero_pncp       TEXT,   -- identificador no PNCP para cruzamento
  data_homologacao  TEXT
);

-- Log de cada execução de coleta
CREATE TABLE IF NOT EXISTS coletas_log (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  fonte             TEXT NOT NULL,
  inicio            TEXT NOT NULL,
  fim               TEXT,
  status            TEXT,   -- 'ok' | 'erro_parcial' | 'erro_total'
  itens_novos       INTEGER DEFAULT 0,
  itens_atualizados INTEGER DEFAULT 0,
  itens_com_erro    INTEGER DEFAULT 0,
  detalhes          TEXT    -- JSON com erros individuais
);

-- Índices para buscas
CREATE INDEX IF NOT EXISTS idx_documentos_tipo ON documentos(tipo);
CREATE INDEX IF NOT EXISTS idx_documentos_ano ON documentos(ano);
CREATE INDEX IF NOT EXISTS idx_documentos_fonte ON documentos(fonte);
CREATE INDEX IF NOT EXISTS idx_documentos_data ON documentos(data_publicacao);
CREATE VIRTUAL TABLE IF NOT EXISTS documentos_fts
  USING fts5(titulo, resumo, texto_completo, content=documentos, content_rowid=id);
```

---

## 7. API REST

Base URL: `http://localhost:3001/api`

### Endpoints

```
GET  /documentos
     ?tipo=edital|decreto|lei|portaria|contrato
     ?ano=2025
     ?fonte=site_prefeitura|pncp|transparencia|camara
     ?pagina=1&limite=20
     → { total, pagina, dados: [ ...documentos ] }

GET  /documentos/:id
     → documento completo com dados_extras e texto_completo

GET  /licitacoes
     ?status=aberta|homologada|deserta
     ?modalidade=pregao|dispensa|inexigibilidade
     ?ano=2025
     → lista com join em licitacoes_detalhes

GET  /estatisticas
     → {
         total_documentos,
         por_tipo: { editais: N, decretos: N, leis: N, ... },
         por_mes: [ { mes, quantidade } ],
         valor_total_licitacoes,
         ultima_coleta
       }

GET  /buscar?q=texto&tipo=&ano=
     → busca full-text em titulo + resumo + texto_completo

GET  /coletas/log?limite=10
     → histórico das últimas coletas com status
```

---

## 8. Lógica dos Coletores

### Classe Base (`coletores/base.js`)

Todo coletor herda de uma classe base que implementa:

```javascript
class ColetorBase {
  async buscarComRetry(url, tentativas = 3)  // retry automático com backoff
  calcularHash(conteudo)                      // SHA256 do texto
  documentoMudou(hash, id)                    // compara com banco
  salvarDocumento(dados)                      // upsert inteligente
  registrarLog(dados)                         // salva em coletas_log
  sleep(ms)                                   // delay entre requisições
}
```

**Regras de comportamento:**
- Delay mínimo de 1 segundo entre requisições ao mesmo domínio
- Máximo 3 tentativas com backoff exponencial (1s, 2s, 4s)
- User-Agent realista: `Mozilla/5.0 ... Chrome/121`
- Timeout de 15 segundos por requisição
- Logar erros sem parar a coleta (continue para o próximo item)

### Coletor do Site Oficial (`coletores/site-prefeitura.js`)

```
1. GET https://ritapolis.mg.gov.br/pagina/6668/Editais
2. Cheerio: extrair todos os <a href="..."> que apontam para /Dados/doc_*.pdf
3. Para cada PDF encontrado:
   a. Extrair data do nome do arquivo (doc_YYYYMMDDHHMMSS.pdf)
   b. Extrair título do link ou elemento adjacente
   c. Calcular hash da URL (se PDF ainda não baixado)
   d. Se novo ou alterado: baixar PDF, extrair texto com pdf-parse
   e. Passar texto para parsers/licitacao.js ou parsers/decreto.js
   f. Salvar em documentos
4. Repetir para outras páginas do site:
   - /pagina/9656/Editais-2  (processos seletivos)
   - Buscar links de decretos e portarias na página inicial
```

### Coletor do Portal de Transparência (`coletores/transparencia.js`)

```
1. Testar se endpoint retorna JSON ou HTML:
   GET /Licitacao/BuscarLista?ano=2025&pagina=1&quantidade=1
2. Se JSON: iterar páginas até totalRegistros esgotado
3. Se HTML: cheerio para extrair tabela
4. Para cada licitação:
   a. Extrair: número, modalidade, objeto, data, valor, status
   b. Buscar link do edital (PDF)
   c. Salvar em documentos + licitacoes_detalhes
5. Repetir para Contratos, Despesas, Receitas
```

### Coletor PNCP (`coletores/pncp.js`)

```
1. GET /contratacoes/publicacao com filtros de IBGE e ano
2. Iterar todas as páginas (campo totalRegistros / tamanhoPagina)
3. Para cada contratação:
   a. Salvar dados básicos
   b. GET /orgaos/{cnpj}/compras/{ano}/{seq}/arquivos → baixar edital
   c. Cruzar com dados da transparência pelo número do processo
4. Marcar duplicatas (mesmo processo no site oficial e no PNCP)
```

---

## 9. Parsers de PDF

### `parsers/licitacao.js`

Recebe texto extraído do PDF e tenta identificar via regex:

```javascript
campos = {
  objeto:           /objeto[:\s]+(.+?)(?:\n|valor)/i,
  valor_estimado:   /valor\s+(?:estimado|global)[:\s]+R\$\s*([\d.,]+)/i,
  modalidade:       /(pregão|dispensa|inexigibilidade|concorrência|tomada)/i,
  numero_processo:  /processo\s+(?:licitatório|n[°º]?)[:\s]*([\d\/]+)/i,
  data_abertura:    /(?:data|abertura)[:\s]+(\d{2}\/\d{2}\/\d{4})/i,
  prazo_vigencia:   /(?:prazo|vigência)[:\s]+(\d+)\s*(?:meses?|dias?)/i,
}
```

Retornar sempre os campos encontrados + `confianca` (0-1) baseada em
quantos campos foram extraídos com sucesso.

### `parsers/decreto.js`

```javascript
campos = {
  numero:     /decreto\s+n[°º]?\s*([\d.\/]+)/i,
  data:       /(?:de|em)\s+(\d{2})\s+de\s+(\w+)\s+de\s+(\d{4})/i,
  ementa:     /ementa[:\s]+(.+?)(?:\n\n|art\.?\s+1)/i,
  autoridade: /(prefeito|prefeita)\s+(?:municipal\s+)?de\s+ritápolis/i,
}
```

---

## 10. Frontend — Interface do Cidadão

### Princípios de UX

- **Linguagem simples.** Em vez de "Inexigibilidade de Licitação nº 015/2025"
  mostrar: "Contratação direta — Banda Beijo para o Réveillon"
- **Mobile-first.** A maioria dos cidadãos acessa pelo celular
- **Busca em destaque.** Campo de busca visível na homepage
- **Contexto nos valores.** R$ 6,5M vira "equivale a R$ 1.272 por habitante"

### Páginas

**`/` — Dashboard**
```
┌─────────────────────────────────────────┐
│  🔍 Buscar em todos os documentos...    │
├──────────┬──────────┬──────────┬────────┤
│ Editais  │ Decretos │   Leis   │Despesas│
│    15    │    48    │    12    │  ...   │
├─────────────────────────────────────────┤
│ Últimas publicações                     │
│ ○ [data] Decreto nº 79 — Abre crédito  │
│ ○ [data] Edital — Aquisição de ...      │
├─────────────────────────────────────────┤
│ Licitações abertas agora (N)            │
│ ┌────────────────────────────────────┐  │
│ │ Pregão 022/2025 · Cartões alimentar│  │
│ │ Abertura: 12/11/2025               │  │
│ └────────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

**`/licitacoes` — Lista de Licitações**
- Filtros: ano, modalidade, status, categoria
- Cards com: número, objeto resumido, modalidade em badge colorido,
  valor estimado (quando disponível), status com ícone
- Ordenação: mais recentes primeiro

**`/documento/[id]` — Detalhe do Documento**
- Todos os campos extraídos
- Link para PDF original (fonte primária)
- Aviso de fonte: "Dados coletados de ritapolis.mg.gov.br em [data]"
- Se licitação: status atual, vencedor, valor final (quando disponível)
- Documentos relacionados (mesmo processo em fontes diferentes)

**`/estatisticas` — Painel de Transparência**
- Gráfico de licitações por mês
- Distribuição por modalidade
- Distribuição por categoria de gasto
- Total movimentado no ano

---

## 11. Agendamento das Coletas

```javascript
// scheduler.js
const cron = require('node-cron');

// A cada 6 horas — site oficial e câmara
cron.schedule('0 */6 * * *', () => coletorSitePrefeitura.executar());
cron.schedule('0 */6 * * *', () => coletorCamara.executar());

// A cada 2 horas — portal de transparência (muda mais frequentemente)
cron.schedule('0 */2 * * *', () => coletorTransparencia.executar());

// Diariamente às 08h — PNCP
cron.schedule('0 8 * * *', () => coletorPNCP.executar());
```

---

## 12. Scripts de Linha de Comando

```bash
# Inicializar banco de dados
npm run setup-db

# Executar todos os coletores agora
npm run coletar

# Executar coletor específico
npm run coletar:editais
npm run coletar:transparencia
npm run coletar:camara
npm run coletar:pncp

# Subir API
npm run api

# Subir frontend
npm run dev

# Subir tudo junto
npm start

# Ver log das últimas coletas
npm run log
```

---

## 13. Variáveis de Ambiente (`.env`)

```env
# Banco de dados
DB_PATH=./data/ritapolis.db

# API
API_PORT=3001
API_HOST=localhost

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:3001/api

# Coletor — comportamento
COLETOR_DELAY_MS=1000         # delay entre requisições
COLETOR_TIMEOUT_MS=15000      # timeout por requisição
COLETOR_RETRY_MAX=3           # máximo de tentativas
COLETOR_USER_AGENT=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36

# Município
IBGE_CODE=3156106
CNPJ_PREFEITURA=18557553000105
CNPJ_CAMARA=26148056000181
```

---

## 14. Ordem de Implementação (MVP)

### Etapa 1 — Fundação e primeiro dado real ✦ PRIORIDADE MÁXIMA

- [ ] Criar estrutura de pastas
- [ ] `package.json` com todas as dependências
- [ ] `src/db/schema.sql` e `src/db/setup.js`
- [ ] `src/db/index.js` com helpers `salvar()`, `buscar()`, `atualizar()`
- [ ] `src/coletores/base.js` com retry, hash, logging
- [ ] `src/coletores/site-prefeitura.js` — só a listagem de editais
- [ ] `scripts/coletar-agora.js` executável
- [ ] Testar: `node scripts/coletar-agora.js` deve popular a tabela

**Critério de aceite:** Após rodar, `SELECT count(*) FROM documentos` retorna
número maior que zero, com `url_pdf` preenchida para cada registro.

### Etapa 2 — Download e parsing de PDFs

- [ ] `src/parsers/pdf.js` — wrapper do pdf-parse com tratamento de erro
- [ ] `src/parsers/licitacao.js` — extração de campos via regex
- [ ] Integrar no coletor do site: após listar, baixar e parsear cada PDF
- [ ] Popular campo `texto_completo` e `dados_extras`

**Critério de aceite:** Pelo menos 1 edital com `valor_estimado` preenchido
extraído automaticamente do texto do PDF.

### Etapa 3 — Portal de Transparência

- [ ] `src/coletores/transparencia.js`
- [ ] Testar endpoints do SH3 (JSON vs HTML)
- [ ] Popular `licitacoes_detalhes` com status e vencedor quando disponível
- [ ] Cruzar com documentos da Etapa 1 pelo número do processo

**Critério de aceite:** Licitações com `status` preenchido e, quando
homologadas, `vencedor_nome` e `valor_final`.

### Etapa 4 — Câmara e PNCP

- [ ] `src/coletores/camara.js`
- [ ] `src/coletores/pncp.js`
- [ ] Lógica de deduplicação: mesmo processo em múltiplas fontes
      → um único `documento_id` com múltiplos `url_origem`

### Etapa 5 — API REST

- [ ] `src/api/server.js` com Express
- [ ] Todos os endpoints documentados na seção 7
- [ ] Full-text search com FTS5 do SQLite
- [ ] Middleware de CORS para o frontend Next.js

### Etapa 6 — Frontend

- [ ] Scaffold Next.js com Tailwind e shadcn/ui
- [ ] Página `/` — dashboard com stats e últimas publicações
- [ ] Página `/licitacoes` — lista com filtros
- [ ] Página `/documento/[id]` — detalhe completo
- [ ] Página `/estatisticas` — gráficos

---

## 15. Tratamento de Erros e Qualidade

### O que nunca deve travar a coleta

- PDF inacessível → registrar `status_coleta = 'erro_pdf'`, continuar
- Timeout de rede → registrar no log, tentar novamente na próxima coleta
- Parsing sem resultado → salvar documento sem campos extraídos
- Site fora do ar → log de erro, não apagar dados anteriores

### Integridade dos dados

- Nunca deletar um documento — apenas atualizar ou marcar como desatualizado
- Sempre manter `url_origem` como referência primária auditável
- Se hash mudou: criar nova versão, manter anterior com flag `substituido=true`

---

## 16. Contexto das Fontes para a IA de Codificação

### Comportamento esperado do site `ritapolis.mg.gov.br`

O site usa o sistema **Publica Cidade** (empresa de software para prefeituras
mineiras). A estrutura HTML típica da página de editais é uma lista de links
apontando para PDFs no path `/Dados/`. O scraper deve:

1. Fazer GET na página sem JavaScript (cheerio é suficiente)
2. Selecionar todos os elementos `<a>` cujo `href` contenha `/Dados/doc_`
3. O texto do link geralmente é o título do documento
4. A data é extraível do timestamp no nome do arquivo

### Comportamento esperado do portal SH3

O sistema SH3 da Transparent Data (empresa de Minas Gerais) é usado por
centenas de prefeituras mineiras. Seus endpoints de lista geralmente aceitam
parâmetros `ano`, `pagina`, `quantidade` e retornam JSON com campos:

```json
{
  "totalRegistros": 150,
  "pagina": 1,
  "quantidade": 50,
  "dados": [ ... ]
}
```

Caso retorne HTML em vez de JSON, a tabela de resultados tem classe CSS
`.table` ou `table-striped`. Tratar os dois casos.

### PNCP — Paginação

A API do PNCP usa paginação com campos `pagina` (começa em 1) e
`tamanhoPagina` (máximo 50). Iterar até que `dados.length < tamanhoPagina`
ou até `pagina * tamanhoPagina >= totalRegistros`.

---

## 17. Notas Finais para a IA de Codificação

1. **Começar pela Etapa 1.** Não implementar frontend antes de ter dados reais
   no banco. O critério de aceite é a única validação que importa.

2. **Testar os seletores cheerio antes de tudo.** Fazer um script mínimo que
   apenas imprime os links encontrados na página de editais. Só depois
   integrar ao banco.

3. **O campo `dados_extras` é TEXT com JSON serializado.** Não criar colunas
   separadas para cada campo específico de cada tipo de documento — isso
   impede adicionar novos tipos sem migração de schema.

4. **Não usar ORM.** Better-sqlite3 com queries SQL diretas é mais simples,
   mais rápido e mais fácil de debugar neste projeto.

5. **Logging com winston em arquivo e console.** O log é a principal
   ferramenta de diagnóstico quando um coletor falha silenciosamente.

6. **O frontend nunca chama as fontes originais.** Toda requisição vai para
   a API própria (`localhost:3001`). As fontes originais são exclusividade
   dos coletores.

---

*Documento gerado em maio de 2026. Atualizar seção 3 caso as URLs das fontes
mudem. Versão do spec: 1.0*
