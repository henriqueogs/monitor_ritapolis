# Plano de Desenvolvimento — Monitor Ritápolis

Roadmap mestre do projeto. Registra o que o produto é, o que foi construído e o que vem a seguir.

Atualizado em: 2026-06-08 (v0.8 — Qualidade de dados + coletor PNCP real).

---

## 1. O que é este projeto

O Monitor Ritápolis é uma plataforma de inteligência pública verificável para o município de Ritápolis/MG. Coleta documentos oficiais da Prefeitura e da Câmara, estrutura os dados com parsers determinísticos e enriquece com IA — sempre com rastreabilidade da fonte original.

**O produto não é um repositório de PDFs.** É uma camada de leitura do poder público local: o que está sendo contratado, por quem, a que preço, se há padrões relevantes e onde os dados ainda são incompletos.

### Princípios que não mudam

- Fonte oficial sempre visível — todo número tem origem rastreável.
- IA como apoio, não como fonte — resume, organiza, compara, mas não inventa.
- Lacunas explícitas — quando falta dado, a interface diz isso.
- Dados verificáveis — cada inferência diferencia fato extraído de estimativa.
- Valores sempre com intervalo de tempo explícito — nunca soma grande sem dizer o período (ver CLAUDE.md §11.1).
- "Recente" = data de publicação, não de processamento do sistema (ver CLAUDE.md §11.2).
- Mock nunca em produção.

### Município monitorado

| Campo | Valor |
|---|---|
| Município | Ritápolis/MG |
| IBGE | 3156106 |
| CNPJ Prefeitura | 18.557.553/0001-05 |
| CNPJ Câmara | 26.148.056/0001-81 |

---

## 2. Arquitetura de dados (três camadas)

```
1. Fatos locais      → parsers, tabelas de produtos, grupos por processo, anexos
2. Fonte nacional    → PNCP (vencedores, valores homologados, contratos — via API por CNPJ)
3. Síntese IA        → resumo por documento (v1.1), leitura integrada (v2.0), inteligência cruzada
```

A IA só opera sobre dado já estruturado nas camadas 1 e 2. Nunca substitui a coleta.

**PNCP — coletor por CNPJ (`src/coletores/pncp.js`):**
- Itera sequenciais por ano: `GET /api/consulta/v1/orgaos/{cnpj}/compras/{ano}/{seq}` até 404.
- Também busca atas e contratos com janela anual.
- Cobre Prefeitura (18557553000105) e Câmara (26148056000181).
- Integrado ao `update-runner.js` como `fonte: 'pncp'` (incluso em `'todas'`).

> **Status (junho 2026):** Ritápolis publica pontualmente no PNCP. Confirmado 1 Pregão Eletrônico (2025/1 — mobiliário planejado, R$ 6,51M). Atas e contratos: nenhum encontrado via API. O coletor está ativo e roda junto com as demais fontes.

---

## 3. Estado atual da base (junho 2026)

| Dado | Valor |
|---|---|
| Documentos cadastrados | ~626 |
| Da Prefeitura | ~533 |
| Da Câmara | ~13 |
| Do PNCP | 1 |
| Licitações/editais | 494 |
| Resumos IA — editais 2026 | 25/25 (status ok) |
| Leitura integrada — 2026 | 26/26 licitações com grupo |
| Produtos estruturados | 219 em 8 licitações |
| Com preço final + fornecedor | 217 |
| Valores identificados | R$ 1,66M em 14 licitações com vencedor |
| Fornecedores consolidados (CNPJs únicos) | 25 |
| Licitações classificadas por categoria | 495 (7 categorias) |
| Resumos IA pendentes (anos anteriores) | ~380 (scheduler ativo) |

---

## 4. Histórico de versões

### v0.1–v0.3 — Fundação
Coleta real da Prefeitura e Câmara, banco SQLite, API Express, frontend básico. Suporte a PDF, DOCX, DOC. Deduplicação (65 registros removidos). Resumos IA com NVIDIA (chunking assíncrono, contrato v1.1). Grupos de processo (26 grupos 2026), leitura integrada contrato v2.0. Produtos estruturados: 219 itens, R$ 1,66M rastreados.

### v0.4–v0.5 — Design e validação
Design system glassmorphic. Novo tipo `publicacao_extrato`. Validação completa em desktop (1280px) e mobile (375px). `/sobre` com estado real.

### v0.6 — Camada de Inteligência
Auditoria de dados (score 0–100, 545 docs, distribuição por faixa). Consolidação de fornecedores (25 CNPJs únicos, ranking por valor). Classificação por categoria (495 licitações, 7 categorias). Dashboard público `/inteligencia` com panorama agregado, alertas e rankings.

### v0.7 — Schedulers + PNCP v3
Scheduler de coletas automáticas (12h, `collection-scheduler.js`). Scheduler de IA diário (2 ciclos × 15 docs, `ai-daily-scheduler.js`). Endpoint `GET /api/scheduler/status`. Integração PNCP v3 via API direta por CNPJ (`pncp-orgaos.js` + `pncp:sincronizar`). Documentação consolidada e repositório publicado no GitHub.

### v0.8 — Qualidade de dados + UX + Coletor PNCP real
Extração de texto de atas/contratos como anexos (14→124 vencedores, 219→2538 produtos, R$1,66M→R$7,64M). Trigger automático de resumo IA ao coletar documento novo. Ajustes de UX diversos.

**Qualidade de dados (junho 2026):** Filtro `isDocumentoValido()` na câmara para rejeitar elementos de UI/filtros. Detecção de PDFs baseados em imagem (`status_coleta: 'imagem'`). Correção de preview genérico: URLs de lista da Prefeitura bloqueadas como source pages. Correção de duplicação no `findDocumentoByIdentity()` para `site_prefeitura`. Fix de SAPL: `url_pdf` aponta para página HTML do SAPL.

**PNCP real:** `src/coletores/pncp.js` — busca por sequencial e por janela temporal. 1 Pregão confirmado (2025/1, Prefeitura). Integrado ao `update-runner.js`.

---

## 5. Análise do Processo (leitura integrada)

A "Análise do Processo" é gerada por IA (contrato v2.0) e aparece na página de cada edital. É **diferente do resumo IA** — enquanto o resumo sintetiza o texto do PDF, a análise do processo **cruza dados de múltiplas fontes**:

**O que a IA recebe como entrada:**
- Dados estruturados da Prefeitura: modalidade, valores, vencedor (se extraído)
- Produtos estruturados de atas e listas de itens
- Dados PNCP: correspondências confirmadas (quando disponível)
- Divergências detectadas entre fontes (ex: valor da ata difere do edital)

**O que a IA gera (JSON estruturado):**
- Título sintético do processo
- Narrativa de 2–3 parágrafos em linguagem de cidadão
- Pontos principais
- Consistência dos dados (campo a campo: consistente, divergente, incompleto)
- Alertas (nível baixo/médio/alto)
- Lacunas conhecidas

**Quando é gerada:**
- Atualmente: manualmente via botão "Regenerar análise" na página do documento, ou via `npm run ai:correlacionar -- --documento-id=N`
- A partir da v0.8: automaticamente após o resumo IA ser gerado com sucesso E após extração de anexos com novos dados

**Por que só para editais:** o cruzamento de dados só faz sentido para licitações — documentos que têm produtos, vencedor e processo de compra associado.

---

## 6. Roadmap v0.9+

### Prioridade alta

**Autenticação administrativa**
Proteger `/admin/*` com HTTP Basic Auth (usuário/senha em variável de ambiente). Sem banco de usuários, sem OAuth — proteção mínima antes de publicar amplamente.

**Cobertura PNCP anos anteriores** *(parcialmente concluído)*
Coletor ativo desde 2023. Confirmado: Prefeitura publica apenas pontualmente no PNCP (1 edital em 2025). Monitorar crescimento — executar `npm run coletar -- --fonte=pncp` periodicamente.

**Build de produção e deploy**
Testar `next build && next start` em produção. Dockerizar backend + SQLite. Deploy em Railway/Fly.io (backend) + Vercel (frontend).

### Prioridade média

**Portal de transparência financeira**
Despesas, empenhos e pagamentos — cruzar com licitações quando a fonte estiver estável.

**Alertas públicos**
Notificar quando nova licitação de alto valor for publicada.

**Revisão de correspondências PNCP**
Interface em `/admin/pncp` para confirmar/rejeitar sugestões de correspondência com score intermediário.

**Busca com inteligência IA (v0.9+)**
Interpretação semântica de consultas em linguagem natural — "quais obras foram contratadas em 2024?" — cruzando múltiplas tabelas com contexto. Depende de cobertura IA >80% e índice semântico dos resumos. Não implementado na v0.8; o campo de busca atual é uma busca textual simples direcionada para `/acervo`.

**Origem por processo na Prefeitura (origem rastreável — §11.3)**
Investigado em 2026-06-17. O CMS da Prefeitura (ritapolis.mg.gov.br, SH3) **não
expõe permalink por processo**: a listagem `/pagina/<RPID>/Editais` carrega os
itens via AJAX (`ws_consulta/Conteudo_Generico.php`, POST), sem aceitar params na
URL — não dá para deep-linkar uma busca. O CMS tem um campo "Link do processo",
mas vem **vazio** (`http://`). Conclusões e plano:
- A **URL do arquivo oficial** (`Obter_Arquivo_Cadastro_Generico.php?INT_ARQ=…`,
  já em `url_pdf`) é a origem mais específica e estável que existe — é *onde o
  documento está publicado*. A UI deve tratá-la como fonte oficial primária; a
  listagem genérica é contexto de último recurso (`source-links.js` já prioriza
  o arquivo).
- O endpoint de busca (`INT_CAD_GEN=612`, `STR_BSC_CAD_GEN=<numero>`, cookie
  `INT_RPID=<rpid>`) devolve o registro específico (campos Data/sessão, Objeto,
  anexos com datahora). **Não é permalink** (POST → fragmento HTML), mas serve
  para **verificar/enriquecer** um doc pelo número: confirmar que segue no ar e
  reextrair a datahora de publicação. Candidato a um verificador de procedência
  sob demanda.
- Se algum dia a Prefeitura preencher "Link do processo", capturá-lo como
  `url_origem` (hoje ignorar quando for `http://`/vazio).

**Alertas de Inteligência → "Descobertas" (implementado)**
Pipeline recorrente que analisa os resumos IA, agrupa por (categoria, ano) e por
processo, e gera descobertas com narrativa em linguagem natural + metadados. Detectores
puros em `src/alertas/detectores/` (repetição temática, risco alto via
`alertas[].nivel`, valor relevante por ano §11.1, anomalia temporal,
questionamentos via `lacunas`/`consistencia`); consolidação idempotente por
`chave_unica`; narrativa via NVIDIA (`src/ai/alert-narrative.js`). Persistência em
`alertas`/`alertas_documentos`/`alertas_watermark`/`alertas_config` (tabelas seguem
`alertas` por dentro; o público é "Descobertas").

**Thresholds afináveis** em `/admin/alertas`: as 5 chaves de `alertas_config`
(`min_repeticao`, `valor_threshold`, `anomalia_multiplicador`,
`anomalia_min_absoluto`, `gatilhos_ativos`) são semeadas por
`scripts/seed-alertas-config.js` e editáveis no painel. O gerador
(`generateAlerts`) tem dois modos: **incremental** (por watermark, usado pelo
scheduler diário) e **full** (`--full` / botão "Gerar descobertas agora") que
varre todo o acervo e **reconcilia** o feed — remove ativos abaixo do threshold
via `repo.removerAtivosNaoListados`, preservando decisões humanas
(arquivado/suprimido).

API em `/api/alertas*` (`/config` GET/PATCH, `POST /gerar` aceita `full`); CLI
`npm run alertas:gerar[:dry]` e `node scripts/gerar-alertas.js --full`. Frontend:
destaques na home, **`/descobertas`** (lista) e **`/descobertas/[id]`** (detalhe
com documentos e `url_origem`) — CSS Module próprio
(`frontend/app/descobertas/styles.module.css`), tom de curiosidade, paleta calma
(nível como ponto+rótulo, sem vermelho de pânico). Validado em dados reais (539
docs → 50 descobertas: 13 "Vale conferir" + 37 "Curiosidade"). Futuro:
notificação por e-mail/WhatsApp, assinatura por cidadão, seletor de intervalo nas
telas de valores, e ajustar prompt da narrativa para não usar "Alerta:" no título
(briga com o tom de "Descobertas").

### Decisões técnicas permanentes

- SQLite no curto e médio prazo
- Frontend consome apenas a API própria
- NVIDIA como provider padrão de IA; Gemini e Groq como fallback
- PNCP por CNPJ antes de busca fuzzy
- Classificação por keyword antes de chamar IA
- Mock nunca em produção
