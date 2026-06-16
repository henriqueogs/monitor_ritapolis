# Monitor Ritapolis — Padrões de Desenvolvimento

Este arquivo é lido pela IA no início de cada sessão. Toda modificação de código **deve seguir** estes padrões sem exceção.

---

## 1. Visão Geral do Projeto

**Monitor Ritapolis** é uma plataforma de inteligência pública que coleta, processa e enriquece com IA documentos do portal da Prefeitura de Ritápolis (editais, contratos, decretos, portarias) e da Câmara Municipal.

**Stack:**
- **Backend:** Node.js 24+, Express 4, SQLite (node:sqlite), CommonJS (`require`)
- **Frontend:** Next.js 14, React 18, CSS Modules
- **IA:** NVIDIA NIM / Gemini / Groq via SDK `openai`-compatible
- **Testes:** Jest (backend + frontend), Playwright (E2E)
- **Qualidade:** ESLint + Prettier

---

## 2. Arquitetura — Domain-Driven Design (DDD)

### 2.1 Camadas

```
┌─────────────────────────────────────────┐
│  Interface Layer                        │
│  src/api/server.js  ·  frontend/app/    │
├─────────────────────────────────────────┤
│  Application Layer                      │
│  src/coletas/  ·  src/ai/               │
├─────────────────────────────────────────┤
│  Domain Layer  ← regras de negócio aqui │
│  src/licitacoes/  ·  src/parsers/       │
│  src/cobertura/   ·  src/utils/         │
├─────────────────────────────────────────┤
│  Infrastructure Layer                   │
│  src/db/  ·  src/coletores/             │
│  src/integracoes/  ·  src/ai/providers/ │
└─────────────────────────────────────────┘
```

### 2.2 Domínios e Responsabilidades

| Domínio | Pasta | Responsabilidade |
|---|---|---|
| **Documentos** | `src/parsers/`, `src/cobertura/` | Entidade central — extração, cobertura |
| **Licitações** | `src/licitacoes/`, `src/parsers/licitacao*.js` | Processos licitatórios, agrupamentos, normalização |
| **Coleta** | `src/coletores/`, `src/coletas/` | Scraping, agendamento, sincronização incremental |
| **Integrações** | `src/integracoes/` | PNCP, correlação entre fontes externas |
| **IA** | `src/ai/` | Resumo, análise integrada, validação de contratos |
| **Persistência** | `src/db/` | Repositórios SQLite, schema, queries |
| **API** | `src/api/server.js` | Rotas HTTP — sem lógica de negócio |

### 2.3 Regras de DDD

1. **Lógica de negócio fica no Domain Layer** — nunca em rotas, coletores ou DB.
2. **Repositórios (src/db/) não conhecem regras de negócio** — só fazem CRUD.
3. **Rotas (server.js) não fazem cálculos** — delegam a services ou domain objects.
4. **Coletores não fazem parsing complexo** — chamam parsers do domain.
5. **Funções puras são preferidas** para domain logic — sem efeitos colaterais, fácil de testar.
6. **`src/db/index.js` deve ser dividido** por domínio quando > 500 LOC:
   - `src/db/documentos-repo.js`
   - `src/db/licitacoes-repo.js`
   - `src/db/ai-jobs-repo.js`
   - etc.

---

## 3. Testes — Test-Driven Development (TDD)

### 3.1 Framework e Configuração

- **Backend:** Jest (`jest.config.js` na raiz)
- **Frontend:** Jest + React Testing Library (`frontend/jest.config.js`)
- **E2E:** Playwright (`playwright.config.js` na raiz)

### 3.2 Onde vivem os testes

```
src/
  parsers/
    licitacao.js
    licitacao.test.js        ← teste ao lado do arquivo
  licitacoes/
    grupos.js
    grupos.test.js
  ai/
    validate-summary.js
    validate-summary.test.js

frontend/app/
  components/
    DocumentCard.js
    DocumentCard.test.js     ← mesmo padrão
  licitacoes/
    page.js
    page.test.js

tests/
  e2e/                       ← testes Playwright
    documento-detail.spec.js
    busca-acervo.spec.js
  integration/               ← testes com DB real
    documentos-repo.test.js
```

### 3.3 Ciclo TDD (Red → Green → Refactor)

Para **toda nova feature ou correção de bug**:

1. **Escrever o teste primeiro** — ele deve falhar (Red)
2. **Implementar o mínimo** para o teste passar (Green)
3. **Refatorar** sem quebrar o teste (Refactor)

**Exemplo:**
```js
// ERRADO: implementar primeiro, testar depois
// CORRETO:
// 1. Escrever licitacao.test.js com caso de uso
// 2. Ver falhar
// 3. Implementar licitacao.js
// 4. Ver passar
// 5. Refatorar se necessário
```

### 3.4 Padrões de Teste

**Nomenclatura:**
```js
// Arquivo: src/parsers/licitacao.test.js
describe('LicitacaoParser', () => {
  describe('extrairNumeroProcesso', () => {
    it('extrai número no formato PP-001/2024', () => { ... });
    it('retorna null quando formato é inválido', () => { ... });
    it('normaliza espaços antes de extrair', () => { ... });
  });
});
```

**Estrutura AAA (Arrange → Act → Assert):**
```js
it('agrupa edital com ata de resultado correspondente', () => {
  // Arrange
  const documentos = [
    { id: 1, tipo: 'edital', numero_processo: 'PP-001/2024' },
    { id: 2, tipo: 'ata',    numero_processo: 'PP-001/2024' },
  ];

  // Act
  const grupos = agruparPorProcesso(documentos);

  // Assert
  expect(grupos).toHaveLength(1);
  expect(grupos[0].edital.id).toBe(1);
  expect(grupos[0].documentos_vinculados).toHaveLength(1);
});
```

**Mocks — quando usar:**
- Mockar: HTTP externo (coletores, PNCP API, IA providers)
- NÃO mockar: parsers, domain logic, normalização — testar real
- Para DB: usar banco em memória SQLite (`:memory:`) nos testes de repositório

```js
// Mock de provider de IA
jest.mock('../providers/nvidia-provider', () => ({
  callLLM: jest.fn().mockResolvedValue({ choices: [{ message: { content: '{"resumo":"..."}' } }] })
}));
```

### 3.5 Cobertura Mínima por Camada

| Camada | Cobertura Mínima | Tipo de Teste |
|---|---|---|
| `src/parsers/` | 90% | Unit |
| `src/licitacoes/` | 85% | Unit |
| `src/ai/validate-summary.js` | 90% | Unit |
| `src/db/*-repo.js` | 70% | Integration (SQLite :memory:) |
| `src/api/server.js` | 60% | Integration (supertest) |
| `frontend/components/` | 70% | Component (RTL) |
| E2E críticos | caminho feliz | Playwright |

**Rodar testes:**
```bash
npm test              # todos os testes
npm run test:unit     # só unitários
npm run test:int      # integração
npm run test:e2e      # Playwright
npm run test:watch    # TDD watch mode
npm run test:coverage # relatório de cobertura
```

---

## 4. Qualidade de Código

### 4.1 ESLint

Configuração no `.eslintrc.js`. Regras obrigatórias:

```js
// .eslintrc.js
module.exports = {
  env: { node: true, es2022: true },
  extends: ['eslint:recommended'],
  rules: {
    'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'eqeqeq': 'error',
    'no-var': 'error',
    'prefer-const': 'error',
    'no-magic-numbers': ['warn', { ignore: [0, 1, -1], ignoreArrayIndexes: true }],
  }
};
```

### 4.2 Prettier

```json
// .prettierrc
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "es5",
  "printWidth": 100,
  "tabWidth": 2
}
```

### 4.3 Limites de Tamanho

| Unidade | Máximo | Ação quando excede |
|---|---|---|
| Arquivo | 300 LOC | Dividir por responsabilidade |
| Função | 40 LOC | Extrair sub-funções |
| Parâmetros de função | 3 | Usar objeto de opções |
| Nesting | 3 níveis | Early return ou extração |

**`src/db/index.js` (4,828 LOC) é exceção temporária** — deve ser dividido progressivamente em repositórios por domínio.

### 4.4 Padrões de Código

**Early return:**
```js
// ERRADO
function processarDocumento(doc) {
  if (doc) {
    if (doc.texto_completo) {
      return extrair(doc.texto_completo);
    }
  }
  return null;
}

// CORRETO
function processarDocumento(doc) {
  if (!doc) return null;
  if (!doc.texto_completo) return null;
  return extrair(doc.texto_completo);
}
```

**Objetos de configuração em vez de parâmetros múltiplos:**
```js
// ERRADO
async function resumirDocumento(docId, modelo, versaoContrato, force, concorrencia)

// CORRETO
async function resumirDocumento(docId, { modelo, versaoContrato, force = false, concorrencia = 1 } = {})
```

**Constantes nomeadas em vez de magic strings:**
```js
// ERRADO
if (doc.tipo === 'edital') { ... }

// CORRETO
const TIPOS_DOCUMENTO = { EDITAL: 'edital', ATA: 'ata', CONTRATO: 'contrato' };
if (doc.tipo === TIPOS_DOCUMENTO.EDITAL) { ... }
```

**Funções puras para domain logic:**
```js
// ERRADO — efeito colateral escondido
function normalizarProcesso(texto) {
  logger.info('normalizando...');  // efeito colateral
  return texto.trim().toUpperCase();
}

// CORRETO — pura, testável
function normalizarProcesso(texto) {
  return texto.trim().toUpperCase();
}
```

### 4.5 Tratamento de Erros

```js
// Erros esperados de negócio — retornar null/undefined com log
function parsearProdutos(texto) {
  if (!texto || texto.length < 10) {
    logger.warn('parsearProdutos: texto insuficiente', { length: texto?.length });
    return [];
  }
  // ...
}

// Erros de infra (rede, DB, IA) — propagar com contexto
async function chamarProviderIA(prompt, opcoes) {
  try {
    return await provider.chat(prompt, opcoes);
  } catch (err) {
    throw new Error(`IA provider falhou [${opcoes.modelo}]: ${err.message}`, { cause: err });
  }
}

// Nunca swallow errors silenciosamente
// ERRADO: catch (err) {}
// CORRETO: catch (err) { logger.error(...); throw ou return default }
```

---

## 5. Naming Conventions

### 5.1 Arquivos

| Tipo | Convenção | Exemplo |
|---|---|---|
| Módulo domain | `kebab-case.js` | `licitacao-detalhes.js` |
| Repositório DB | `{dominio}-repo.js` | `documentos-repo.js` |
| Provider externo | `{servico}-provider.js` | `nvidia-provider.js` |
| Teste unitário | `{modulo}.test.js` | `licitacao-detalhes.test.js` |
| Teste E2E | `{fluxo}.spec.js` | `busca-acervo.spec.js` |
| Componente React | `PascalCase.js` | `DocumentCard.js` |

### 5.2 Funções e Variáveis

| Tipo | Convenção | Exemplo |
|---|---|---|
| Função | `camelCase` verbo + substantivo | `extrairProdutos`, `agruparPorProcesso` |
| Async | prefixo indica intenção | `fetchDocumento`, `salvarResumo` |
| Constante de módulo | `UPPER_SNAKE_CASE` | `TIPOS_DOCUMENTO`, `STATUS_JOB` |
| Variável booleana | prefixo `is/has/pode` | `isEdital`, `hasResumoAi`, `podeProcessar` |
| Callback/handler | prefixo `handle` | `handleErroProvider`, `handleRetry` |

### 5.3 Banco de Dados

- Tabelas: `snake_case` plural — `documentos`, `licitacoes_detalhes`
- Colunas: `snake_case` — `texto_completo`, `numero_processo`
- Índices: `idx_{tabela}_{coluna}` — `idx_documentos_tipo`
- Parâmetros de query: `:parametro` — `:docId`, `:tipo`

---

## 6. Estrutura de Módulo Padrão

Todo módulo de domínio segue esta estrutura:

```js
'use strict';

// 1. Imports de infra (db, logger, config)
const logger = require('../logger');
const config = require('../config');

// 2. Constantes do módulo
const LIMITE_DEFAULT = 100;

// 3. Funções puras (domain logic) — as mais testáveis
function normalizarNumeroProcesso(texto) {
  // ...
}

// 4. Funções de orquestração (podem ser async)
async function processarGrupo(grupo, opcoes = {}) {
  // ...
}

// 5. Exports explícitos e nomeados
module.exports = {
  normalizarNumeroProcesso,
  processarGrupo,
};
```

---

## 7. Anti-padrões Proibidos

**Nunca fazer:**

1. **Lógica de negócio em rotas Express** — extrair para domain service
2. **Queries SQL dentro de parsers ou coletores** — repositório é responsável por DB
3. **`console.log` em produção** — usar `logger.info/warn/error` do Winston
4. **`require()` dentro de funções** — sempre no topo do arquivo
5. **Arquivos > 300 LOC sem plano de divisão** — criar issue/comment explicando
6. **Testes sem asserção** (`expect` faltando) — Jest falha em modo strict
7. **Swallow de erros** (`catch (e) {}`) — sempre logar ou relançar
8. **Hard-coded URLs, credenciais ou paths** — sempre via `src/config.js`
9. **Modificar `src/db/index.js` sem considerar divisão** — verificar se a função nova pertence a um repositório específico
10. **Testes que dependem de ordem de execução** — cada teste deve ser independente

---

## 8. Checklist para Toda Modificação

Antes de qualquer commit, a IA deve verificar:

- [ ] **Tem teste?** Nova lógica de domínio tem teste unitário correspondente
- [ ] **TDD?** Se feature nova, teste foi escrito antes da implementação
- [ ] **Camada correta?** Código está na camada certa (não negócio em rota, não query em parser)
- [ ] **Tamanho OK?** Arquivo resultante ≤ 300 LOC (ou exceção documentada)
- [ ] **Sem magic strings?** Usar constantes para tipos, status, chaves
- [ ] **Early return?** Sem nesting desnecessário
- [ ] **Sem console.log?** Usar `logger`
- [ ] **Export explícito?** `module.exports = { ... }` com nomes específicos
- [ ] **Docs?** README ou DEVELOPMENT_PLAN atualizado se comportamento externo mudou

---

## 9. Prioridades de Refatoração (Backlog Técnico)

Ordem de prioridade para melhorar progressivamente a base:

### Prioridade 1 — Fundação (fazer antes de novas features)
- [ ] Configurar Jest (`jest.config.js` na raiz + `frontend/jest.config.js`)
- [ ] Configurar ESLint (`.eslintrc.js`)
- [ ] Configurar Prettier (`.prettierrc`)
- [ ] Adicionar scripts `npm test`, `npm run lint`, `npm run format`
- [ ] Escrever testes para `src/parsers/licitacao.js` (parser principal)
- [ ] Escrever testes para `src/ai/validate-summary.js` (lógica crítica)
- [ ] Escrever testes para `src/licitacoes/grupos.js` (agrupamento)

### Prioridade 2 — Divisão do Monólito DB
- [ ] Criar `src/db/documentos-repo.js` com funções de `src/db/index.js` do domínio documentos
- [ ] Criar `src/db/licitacoes-repo.js`
- [ ] Criar `src/db/ai-jobs-repo.js`
- [ ] Criar `src/db/coletas-repo.js`
- [ ] `src/db/index.js` vira apenas re-export de compatibilidade

### Prioridade 3 — Separar Rotas de Business Logic
- [ ] Extrair lógica de `src/api/server.js` para `src/services/`
- [ ] `server.js` passa a ser apenas roteamento e serialização HTTP

### Prioridade 4 — Cobertura de Testes
- [ ] Testes de integração para repositórios (SQLite `:memory:`)
- [ ] Testes de componentes frontend com React Testing Library
- [ ] E2E Playwright para: busca no acervo, detalhe de edital, painel admin

---

## 10. Comandos de Desenvolvimento

```bash
# Qualidade
npm run lint          # ESLint
npm run format        # Prettier
npm test              # Jest (todos)
npm run test:watch    # TDD watch
npm run test:coverage # Cobertura

# Desenvolvimento
npm run dev           # API + frontend simultâneo
npm run api           # Só backend
npm run frontend      # Só Next.js

# Dados
npm run coletar       # Coleta incremental
npm run ai:resumir    # Resumo IA de pendentes
npm run db:stats      # Estatísticas do banco
```

---

## 11. Apresentação de Dados (regras de produto)

Regras obrigatórias para qualquer tela, componente ou endpoint que exiba dados ao cidadão.

### 11.1 Valores monetários sempre escopados por intervalo de tempo

**Nunca exibir uma grande soma de valores sem indicar explicitamente o período coberto.** Um número como "R$ 50 milhões" sem dizer de quando é desinforma.

- ✅ "Total empenhado (2023–2026)", "Estimado em 2025", "Recebido 2019–2024"
- ❌ "Valor total", "Total empenhado", "Valor estimado" (sem ano/intervalo)
- Toda soma deve carregar o ano único ou o range (`min–max`) no rótulo ou subtítulo.
- Preferir valores **por ano**; somas multi-ano só com o intervalo explícito ao lado.
- Feature futura: seletor de intervalo de tempo nas telas de valores.

### 11.2 "Recente" = data de publicação, nunca data de processamento

Na home e em qualquer listagem de "novidades/atualizações", o usuário quer os dados **publicados** mais recentemente pela fonte — não os que o sistema coletou/atualizou por último (isso é informação interna).

- ✅ Ordenar por `COALESCE(data_publicacao, data_abertura) DESC`.
- ❌ Ordenar por `coletado_em` / `atualizado_em` (datas internas do sistema).
- Documentos sem data real vão para o **fim**, nunca ao topo via data de sistema.
- `coletado_em`/`atualizado_em` servem só para diagnóstico interno (admin), não para o feed público.
