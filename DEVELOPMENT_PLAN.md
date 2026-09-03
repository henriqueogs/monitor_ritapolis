# Plano de Desenvolvimento — Monitor Ritápolis

**Definições do produto + histórico de versões.** Não é o lugar de números
ao vivo (isso é `COBERTURA.md`, auto-gerado) nem de tarefas em andamento
(isso é `CURRENT_WORK.md`). Ver `QUICK_SUMMARY.md` para o mapa dos três.

Atualizado em: 2026-07-01 (v0.9 — Qualidade de conteúdo: resumo de anexo via IA, narrativa de descobertas consolidada).

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

## 3. Estado atual da base

Números ao vivo ficam só em **[`COBERTURA.md`](COBERTURA.md)** (auto-gerado
via `npm run docs:dados` — nunca editar à mão, evita números contraditórios
entre documentos). PNCP: confirmado 1 Pregão Eletrônico da Prefeitura
(2025/1, R$ 6,51M) via `src/coletores/pncp.js`; Ritápolis publica só
pontualmente lá — a base principal é o portal próprio da Prefeitura.

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

### v0.9 — Descobertas v2 (investigação IA) + qualidade de conteúdo
Segunda etapa das Descobertas: pacote de documentos do mesmo tema (agrupado
por inferência) passa por investigação de IA (`src/ai/discovery-investigation.js`)
buscando falhas/inconsistências, com narrativa pública cautelosa e análise
admin — mais camada de **inteligência de fatos** (`src/inteligencia/`,
`inteligencia_fatos`) extraída de documentos/anexos/produtos, alimentando
detectores adicionais (supressão de árvores, preços, recorrência de
fornecedor, gastos de eventos) independente de resumo de IA.

**Qualidade de conteúdo (01/07/2026)**, a partir de feedback direto do
usuário revisando `/anexo/3284` e `/descobertas/57`:
- **Resumo de anexo via IA real** (`src/ai/summarize-anexo.js`), substituindo
  a heurística antiga ("primeira frase >40 chars", sem IA nenhuma). Job
  assíncrono próprio (`documentos_anexos_resumos_ai_jobs`), gate de qualidade
  de OCR (reaproveita `isImageBasedPdf`) antes de mandar pra IA, botão
  "Regenerar" em `/anexo/[id]`, rotina de lote
  (`npm run inteligencia:regenerar-resumos-anexos[:dry]`).
- **Narrativa de descobertas consolidada**: contrato/prompt de investigação
  ganharam campo `narrativa_consolidada` — parágrafo único que soma fatos +
  lacuna relevante em prosa, com cálculo de razão (R$/unidade, %, etc.) só
  quando fizer sentido pro tema (não é template fixo — validado nos 4 temas
  reais: árvores, compras, contratos recorrentes, eventos). Frontend ganhou
  renderização genérica de `metricas`/`comparativos` (0/1/N métricas, sem
  card vazio forçado). Flag `alertas:narrativa_consolidada_ativa` permite
  reverter sem deploy.
- **Redundância de conteúdo no documento resolvida**: "Resumo do documento"
  e "Leitura simples" mostravam a mesma frase-síntese quando existe resumo
  de IA — corrigido para não repetir.
- **Modelo de IA analisado**: catálogo NVIDIA comparado (Nano atual vs.
  Nemotron Super vs. Llama-3.3-70B). Mecanismo de override por tarefa
  implementado (`NVIDIA_MODEL_INVESTIGACAO`), mas **modelo mantido no Nano**
  — os dois candidatos testados falharam na prática com a conta atual
  (Super quebra o contrato JSON; Llama-3.3 dá timeout, indício de acesso não
  liberado). Ver `CURRENT_WORK.md` (arquivado após conclusão) para os dados.

**Detector de risco via resumo de IA + estabilidade editorial (02/09/2026)**:
- **`riscos.alerta_resumo_ia`**: novo detector de Descobertas minera
  `riscos_ou_alertas` (nível "alto") já presentes nos resumos de IA
  existentes por documento — sem chamada de IA nova, reaproveita leitura já
  paga (`src/inteligencia/fatos-resumo-riscos.js`). 210 candidatos gerados
  no primeiro `--full`.
- **Bug de churn corrigido**: `preservarEstadoTerminal` exigia
  `evidencias_hash` idêntico pra proteger qualquer estado terminal —
  `rejeitado` reabria sozinho quando evidência nova entrava no bucket
  agregado (reproduzido ao vivo: os 51 alertas legado rejeitados via
  `scripts/rejeitar-legado-sem-gate.js` voltaram pra `revisao` no
  `--full` seguinte). `rejeitado` agora dispensa `mesmoHash` — é decisão
  sobre a categoria, não sobre uma citação específica.
- **`npm audit`**: advisory novo em `qs`/`@xmldom/xmldom` (via
  `body-parser`/`express`/`mammoth`) sem fix não-force disponível — resolvido
  via `overrides` no `package.json` forçando `qs@^6.16.0` e
  `@xmldom/xmldom@^0.9.12`.
- **Cache/ISR real em `/empenho/[id]` e `/credores/[cnpj]`**: investigação de
  "uso estranho" na Vercel revelou claudebot+gptbot = 81% de 81K edge
  requests/12h, 0% cached, batendo em cada empenho/credor individualmente.
  Causa raiz dupla: `app/layout.js` tinha `dynamic = 'force-dynamic'` na
  raiz (bloqueia `revalidate` de qualquer página filha — config de layout
  pai não pode ser afrouxada por filho) e, mesmo sem isso,
  `revalidate` sozinho em rota de segmento dinâmico não liga ISR sem
  `generateStaticParams` (mesmo vazio). `force-dynamic` movido pra cada
  página estática que realmente precisa; ISR real habilitado nas duas rotas
  quentes. Confirmado em produção via header `x-nextjs-prerender: 1`.
- **SEO**: JSON-LD `BreadcrumbList` em empenho/credor/documento. Google
  Search Console verificado via DNS (fora do código).
- Ver PRs #42–#45.

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
Implementado em 2026-06-30: `/admin/*` usa HTTP Basic Auth quando
`ADMIN_AUTH_USER` e `ADMIN_AUTH_PASSWORD` estão definidos. Sem banco de usuários,
sem OAuth — proteção mínima antes de publicar amplamente, com fallback aberto
para desenvolvimento local quando as variáveis não existem.

**Cobertura PNCP anos anteriores** *(parcialmente concluído)*
Coletor ativo desde 2023. Confirmado: Prefeitura publica apenas pontualmente no PNCP (1 edital em 2025). Monitorar crescimento — executar `npm run coletar -- --fonte=pncp` periodicamente.

**Build de produção e deploy**
Testar `next build && next start` em produção. Dockerizar backend + SQLite. Deploy em Railway/Fly.io (backend) + Vercel (frontend).

### Prioridade média

**Detecção de PDF-imagem — itens ainda abertos** *(resgatados do arquivo em
`docs/archive/TODO_IMAGE_PDF_DETECTION.md` antes de arquivar)*
- Testes unitários dedicados para `isImageBasedPdf()` (casos: texto legível,
  texto curto, proporção baixa de alfanuméricos, padrões de lixo).
- Scheduler periódico rodando detecção automaticamente (hoje é manual via
  script) + trigger automático de OCR.
- Interface admin para revisar/reverter documentos marcados como
  `status_coleta: 'imagem'` (`GET/POST/DELETE /api/admin/ocr/mark/:id`,
  página `/admin/ocr`).

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
telas de valores.

### Decisões técnicas permanentes

- SQLite no curto e médio prazo
- Frontend consome apenas a API própria
- NVIDIA é o único provider de IA operacional hoje (`src/ai/providers/index.js`
  rejeita qualquer `AI_PROVIDER` diferente de `nvidia`). Gemini/Groq têm
  config reservada em `src/config.js` mas **sem chave configurada e sem
  suporte real** — não tratar como fallback ativo até serem implementados.
- PNCP por CNPJ antes de busca fuzzy
- Classificação por keyword antes de chamar IA
- Mock nunca em produção

---

## 7. Documentos arquivados

Planejamento/postmortem de features já concluídas fica em
[`docs/archive/`](docs/archive/README.md) — histórico, não referência de
estado atual.
