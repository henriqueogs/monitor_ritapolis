# Current Work — Monitor Ritápolis

**Status + pendências.** Definições/arquitetura/histórico vivem em
`DEVELOPMENT_PLAN.md`; números ao vivo em `COBERTURA.md`. Este arquivo fica
enxuto de propósito — só o que está genuinamente em aberto agora. Trabalho
concluído sai daqui e vira uma entrada de histórico em `DEVELOPMENT_PLAN.md`
(ou é arquivado em `docs/archive/` se for detalhado demais pro histórico).

Ver `QUICK_SUMMARY.md` para o mapa geral dos documentos do projeto.

---

## ✅ Concluído — Publicação (MVP)

Deploy em produção desde 28/08/2026 (API em VM Oracle Cloud Always Free +
systemd + Caddy, frontend na Vercel, deploy automático nos dois lados a
cada merge em `master` — ver `docs/DEPLOY.md`). Autenticação admin evoluiu
além do Basic Auth original: login com sessão real (`admin_users`/
`admin_sessions`, `/login`, `src/auth/admin-session.js`). Ver
`.specs/STATE.md` pro fechamento formal da spec.

## ✅ Concluído — Câmara Municipal + Folha Salarial + operação de produção

Ver `DEVELOPMENT_PLAN.md` §4 (v0.10) pro resumo completo: migração Oracle
Cloud, fix do fd-leak do litestream, Folha Salarial (13.648 registros),
Câmara Municipal (legislação + projetos + vereadores), mutex entre
schedulers de background, cache de fetch corrigido (`unstable_cache`
sobrevivendo a `force-dynamic`), `vm.swappiness`/timer de restart semanal.

## ✅ Concluído — Performance: site lento pra iniciar (diagnóstico + fix, deploy 22/09/2026)

Home levava ~8 s em cache frio porque um *server component* aguardava `POST
/coletas/sincronizar-prefeitura` (5 áreas da Prefeitura em série, ~9 s) e os
agregados da API (`/transparencia/resumo` 5–10 s na VM) não tinham cache nem
cache de página SQLite; function do Vercel rodava em `iad1`. Diagnóstico e
plano em fases (evidências, aceite, arquivos) em
`docs/PLANO_PERFORMANCE_CARREGAMENTO.md`. Todas as 5 fases implementadas,
testadas (2067 testes, 213 suites) **e confirmadas em produção em 22/09**:

- [x] Fase 1 — `PrefeituraAutoSync` virou client component (fire-and-forget);
  `checkPrefeituraSyncOnPortalOpen` responde na hora e verifica as 5 áreas em
  paralelo em background (`state.checking` evita duplicar); rota responde `202`.
- [x] Fase 2 — `src/utils/memo-ttl.js` (TTL 10 min) aplicado em
  `getPainelTransparencia`, `getGastosPanorama`,
  `getPainelCidadao`/`getEstatisticas`/`getInteligenciaPanorama`/`getCoberturaPorAno`
  (novo `src/services/painel-cidadao-service.js`, sem mexer no monólito);
  invalidação central via `src/services/cache-registry.js` ao fim de coleta;
  `Cache-Control: s-maxage=600` nos 6 endpoints de agregado.
- [x] Fase 3 — `PRAGMA cache_size`/`mmap_size`/`temp_store` em
  `src/db/connection.js` (config via env); `warmUpAgregados()` no boot de
  `scripts/api.js`.
- [x] Fase 4 — `frontend/vercel.json` (`regions: ["gru1"]`); confirmado que
  nenhum server component aguarda POST/no-store no caminho de render.
- [x] Fase 5 — `tests/e2e/home-tempo.spec.js` (@perf, guardrail < 3s) +
  regra documentada: nenhum server component aguarda rede não-cacheada;
  side effects (sync, coleta, log) sempre client-side ou scheduler.
- [x] **Medido em produção 22/09**: home fria `total` 0,42 s (era 8,1 s);
  `x-vercel-id: gru1::gru1::…` (era `gru1::iad1`); `Cache-Control:
  s-maxage=600` presente no `/transparencia/resumo`; VM com `memAvailableMb:
  261` pós-warm-up (workflow `vm-capacity-check` disparado manualmente,
  status `ok`, bem acima do limiar de 150 MB — não precisou reduzir
  `SQLITE_CACHE_KB`).

**Follow-up 22/09** — achado adicional: `HomePage` ainda fazia um único
`Promise.all` de 4 fetches antes de renderizar qualquer coisa (hero/quick
links ficavam presos atrás do agregado mais lento). Corrigido: `HomePage`
virou sync, hero/quick links renderizam na hora; hubs (`HomeHubsData`) e
fontes oficiais (`LimitsAndSourcesData`) viraram componentes async isolados,
cada um no seu `<Suspense>` com skeleton próprio.

## 🧭 Iniciativa — Camada de IA analítica (RAG) + núcleo agnóstico (iniciada 15/10/2026)

Plano completo em `docs/PLANO_IA_RAG.md`; decisões em `docs/adr/` (0001–0006, status
*proposto*). Fases: 0 fundações (portas, spikes `sqlite-vec` e custo, eval harness) →
1 RAG sobre licitações → 2 ferramentas analíticas → 3 núcleo agnóstico → 4 multi-tenant.
- [x] Plano + ADRs escritos (aguardando revisão/aceite)
- [~] Fase 0 — spikes S1/S2 concluídos (`docs/spikes/S1-S2-sqlite-vec.md`): `sqlite-vec` ok na VM (x86_64, 954 MB RAM); `bge-m3` morto → `nemotron-3-embed-1b` (2048 dim); **pendente**: preço do modelo e `NVIDIA_EMBED_MODEL` no `.env` da VM; portas + testes de contrato (`src/ai/ports`) e eval harness de recuperação (`npm run eval:recuperacao`) prontos; runner de geração (`npm run eval:ia`, PR empilhado) pronto; falta dataset real de 30–50 perguntas; adaptador `sqlite-vec`, busca híbrida, `perguntar()`/rota (desligada) e job de indexação (`npm run ia:indexar`) prontos em PRs empilhados; UI `/perguntar` pronta (noindex, fora da navegação); falta instalar `sqlite-vec` na VM, indexar e ligar `AI_ASK_ENABLED`

## 🎯 Próximos passos (plano de 14/10/2026) — melhorar resumos primeiro

Fotografia ao vivo (`/api/saude/pipeline`, 15/10 00:27 UTC): status `ok`, 0 falhas
reais, 0 erros 429 do provider, CI verde, VM sem alerta. Mas a campanha está
**abaixo do alvo**: 47 docs/24 h (meta 200), `sem_resumo_com_texto`=545,
`pendentes`=192, `waiting.historical_budget`=1126 (fila esperando orçamento).
Pipeline: `anexo-summary` 405 failed vs 421 ok; `items` 206 failed vs 55 ok;
`collection` 62 failed; `extract` 25 failed (categorias: `revisao_fonte`,
`contrato_rejeitado`, `limite_tamanho`). `ia.scheduler.ultimo_ciclo` = null.
Obs.: `curl` na home dá 429 — é o Challenge do firewall Vercel, não queda.

### Fase A — Resumos (prioridade)
- [x] **A1. Por que 47/200?** Sem acesso à VM (SSH de produção negado nesta
  sessão), análise por código (`src/pipeline/queue.js` `claim`). Hipóteses:
  (1) o orçamento é por **tarefa**, não por doc: cada doc gasta extract+summary+
  items+integrated+facts(+anexo) — 4 h/47 docs ≈ 5 min/doc, não 45 s;
  (2) `pipeline_runs` registra **toda** execução histórica, inclusive as que
  falham/dão timeout (até 10 min) e lease expirado (grava 600000 ms fixos) —
  `items` 206 e `anexo-summary` 405 failed queimam orçamento sem gerar resumo;
  (3) janelas diferentes: `docs_24h` é rolante, o orçamento zera à 03:00Z.
  **Medido em produção (15/10, `campanha.consumo_24h`, 24 h):** `items` 32
  execuções, 10 docs, **32 erros, 188 min** (~6 min cada, perto do timeout de
  10 min) — 78% dos 240 min do orçamento; `summary` 28 execuções, 28 docs, 0
  erros, 29 min; `anexo-summary` 26 exec., 17 erros, 21 min; `integrated` 3 exec.
  (2 min); `facts` 4 exec. (0 min). Hipótese 2 **confirmada**: `items` falha
  100% e queima o orçamento sem gerar resumo (causa da falha = A2).
  **Fix A1b (implementado em 15/10, PR da branch `orcamento-historico-falhas`):**
  1. `pipeline_runs` ganha coluna `ok` (migração `ALTER TABLE` guardada por
     `PRAGMA table_info` — o `CREATE IF NOT EXISTS` não altera a tabela da
     produção); `finish()` grava `ok = !error`; lease expirado grava `ok = 0`.
  2. `claim()`: `spent` e o teto de docs/dia passam a contar só `ok = 1`
     (falha não queima orçamento nem "vaga" de doc).
  3. Válvula de segurança: tempo gasto em runs `ok = 0` tem teto próprio
     (`PIPELINE_HISTORICAL_FAIL_BUDGET_MS`, padrão 25% do orçamento) — sem ele,
     falhas não contadas deixariam a VM tentando e falhando sem limite
     (retries já são limitados a 3, mas há >600 jobs failed).
  4. Testes em `queue.test.js`: falha não consome orçamento; falha acima do teto
     bloqueia histórico; recente (`historical = 0`) segue intocado.
  **Backfill (15/10):** a migração marca `ok = 0` nas execuções antigas cujo job
  guarda erro (senão as falhas de antes do deploy seguiam queimando o orçamento
  do dia). Medido na produção em 15/10 desde 03:00Z: 148 min de sucesso + 91 min
  de falha — com o teto padrão de falhas (25% de 240 = 60 min) o histórico
  continua bloqueado até zerar o dia; para retomar antes, subir
  `PIPELINE_HISTORICAL_FAIL_BUDGET_MS` no drop-in da VM (ex.: 7200000), ciente
  de que `items` segue falhando 100% (A2).
  Variável nova: `PIPELINE_HISTORICAL_FAIL_BUDGET_MS` (opcional). Após o deploy,
  conferir em `consumo_24h` que `docs_24h` sobe e `min` de `items` deixa de dominar.
  Risco: o orçamento deixa de limitar tempo real de IA/dia (falhas somam por
  fora) — por isso o item 3. Não resolve a causa das falhas (A2–A4).
- [ ] **A2. `items` (79% failed no total)** — lido na produção (15/10, só leitura).
  Causa de custo: `items` lê o PDF inteiro em fatias de 8 min e **um único
  trecho que falha a evidência derruba o documento todo** (política de
  fidelidade: não trunca nem omite linhas). Um doc (entity 229) gastou 15
  fatias/117 min e terminou em "citacao nao encontrada; exige revisao"; dois
  docs somaram 168 dos 188 min de `items` em 24 h. Erros por tipo (total
  histórico, 217 failed): tabela contradiz linhas 68; citação não encontrada 23;
  `too_big` (>700 chars) 20; campo string ausente (`invalid_type`) 13; demais
  gates de evidência ~25; timeout 3. A maioria são gates funcionando — o
  problema é o **custo antes de falhar**, não os gates.
  **Distribuição medida (15/10, 278 jobs `items`):** 60 ok (mediana 2,1 min, máx
  19 min) × 217 failed; 203 failed < 10 min (337 min no total), 12 failed entre 10
  e 30 min (201 min), só 2 passaram de 30 min (117 e 51 min) e **nenhum** ok
  passou de 19 min. **Feito (2):** teto de **30 min por documento** em `items`
  histórico (`PIPELINE_HISTORICAL_ITEMS_JOB_CAP_MS`): passou disso, o job vai para
  revisão (`exige revisao`, sem alerta) mantendo os checkpoints, em vez de
  ganhar outra fatia de 8 min. Recente não tem teto. Reprocessar: reenfileirar o
  job (retoma dos checkpoints).
  **Feito:** teto diário para `items` histórico (`PIPELINE_HISTORICAL_ITEMS_BUDGET_MS`,
  padrão 25% do orçamento; qualquer resultado conta) — `summary` deixa de
  esperar atrás de `items`. **Em aberto (decisão de produto):** abortar cedo no
  primeiro trecho irrecuperável em vez de ler o resto; tolerar `too_big`/campo
  ausente (hoje contraria a regra "nunca truncar"); prompt para citações.
- [x] **A2c. Extração de itens local** (`scripts/itens-local.js`,
  `src/ai/itens-local.js`): para editais que o teto de 30 min mandou para
  revisão. `exportar --revisao` (VM, leitura) → `gerar pacote.json resultado.json`
  (sua máquina, sem teto de tempo) → `aplicar resultado.json [--apply]` (VM,
  dry-run por padrão). Na aplicação a VM **revalida** texto, anexos, cobertura,
  contrato e citações com `assessItemsResult`; arquivo adulterado ou fonte
  alterada é recusado. Checkpoints da VM não são reaproveitados.
- [x] **A10. JSON do resumo com aspas soltas** (jobs 6098/1022 e família): o
  modelo copia trechos do texto oficial com `"` de OCR (`Programa... ...".: 1202`)
  sem escapar e o JSON quebra — **determinístico**, retry com outra temperatura
  não resolve (reproduzido localmente: 3 de 5 chamadas). `parseSummaryResponse`
  agora escapa a aspa que fechou a string antes da hora (só em erro "after
  property value/array element", nunca quando é aspa+aspa = vírgula faltando).
  Saídas reais capturadas passam no parse e no contrato. Resumo de **anexo**
  (`extractJsonObject`) e demais módulos com parse próprio ainda sem o reparo.
  Job 6086 (decreto 992) é outro caso: latência do provedor (timeout 120 s em 2
  de 3 chamadas; 61 s quando responde), não JSON.
- [x] **A9. Vagas diárias priorizam quem não tem resumo** (`planAi`): medido em
  19/10 — `docs_24h` = 200 (teto), mas só 17–28 resumos/dia (`sem_resumo` 517→449
  em 4 dias): o planejador ia do mais novo ao mais antigo e os `facts` de docs de
  2025 enchiam as 200 vagas, enquanto 2017–2022 esperavam o resumo. Agora a
  ordem é: recentes → históricos **sem resumo ok** → históricos que só precisam
  de etapas seguintes (cada grupo, mais novo primeiro). Conferir após o deploy:
  resumos/dia > 50 e `sem_resumo_com_texto` caindo mais rápido.
- [x] **A2b. Cadeia por documento** (`planner.js`, `planDocument`): summary →
  anexos → (edital: items → integrated) → facts. Antes, `items` em revisão
  (`failed`) fazia `return` e **travava `facts` do edital para sempre** (10
  editais de 2026 sem facts/integrated em 15/10; o teto de 30 min por doc
  aumentaria isso). Agora `facts` segue; `integrated` espera `items` válido.
  Cobertura medida em 15/10: editais 2019–2025 com items 100%; 2026 73/83.
- [ ] **A3. `limite_tamanho` em `collection`**: chunking/map-reduce em vez de
  rejeitar documentos grandes.
- [ ] **A4. `contrato_rejeitado`**: ver prompts/schema; o modelo erra chave
  (já houve `evidencias_usada`) — decidir entre tolerância no parser e
  reforço no prompt.
- [ ] **A5. Fila de revisão** (10 docs aguardando): esvaziar no admin; definir
  SLA para não virar acúmulo silencioso.
- [ ] **A6. Alerta de ritmo**: `campanha_abaixo_da_meta` quando `docs_24h` <
  50% do limite com fila — hoje só alerta por 429 e "sem progresso" (36 h).
- [ ] **A7. Decidir etapa 3** só depois de A1: se o gargalo é tempo/tarefa,
  subir limite não adianta; paralelismo exige RAM (VM 954 MB).
- [ ] **A8. `source-check` pendente (891) e `facts` (191)**: confirmar que
  drenam ou se estão presos.

### Fase B — Na Lupa
- [ ] Avaliar fila de revisão com o mantenedor; rodar novo lote de 20; só então
  religar `DESCOBERTAS_SCHEDULER_ENABLED` (hoje false; 1 público, #57).

### Fase C — OCR Câmara/Prefeitura
- [ ] Aplicar OCR de indicações, resoluções, requerimentos, leis complementares
  e 53 imagens da Prefeitura (fluxo local→JSON→VM por `url_pdf`); cada doc
  aplicado alimenta a fila de A.

### Fase D — Operação
- [ ] Reconfirmar swap da VM e edge requests da Vercel (pendentes desde 17/09).
- [ ] Observabilidade de deep-links fora de datacenter (Worker/proxy).
- [ ] Corrigir contagem de testes citada em "Como retomar" (1041 vs 2067).

### Fase E — Transparência (backlog abaixo)
- [ ] Fonte de recurso → emendas×empenhos → `coTce` → busca unificada →
  detector atípico no scheduler.

**Ordem sugerida:** A1 → A2/A3/A4 (em paralelo, arquivos distintos) → A6 → A5/A8
→ B → C → D → E.

## ⏳ Pendente — Transparência: dados e vinculação (pós Empenhos v2, 02/07/2026)

Entregue em 02/07 (Empenhos v2): página `/empenho/[id]`, painel "Pra onde
vai o dinheiro" por categoria cidadã (`/transparencia/categoria/[slug]`),
lista geral `/transparencia/empenhos` com busca FTS, PeriodoSelector
genérico e detector de gasto atípico nas Descobertas
(`npm run alertas:empenhos`, thresholds em /admin/alertas). Ficam:

- [x] **Validar receita LOA** (06/07) — nível-1 estava correto (2024: R$ 34M
  previsto, plausível; o R$ 215M do registro era a soma bruta da hierarquia).
  O problema real era o numerador: a % de execução somava ordens de
  pagamento junto com empenhos; `porAno.valor_empenhado` (sem OP) corrige.
  Cards de execução orçamentária desbloqueados.
- [x] **Fila de pagamentos** (06/07) — seção "quem está esperando receber"
  em /transparencia (391 liquidados não pagos, R$ 1,58M, desde jun/2023);
  `getFilaPagamentos` + `GET /api/transparencia/fila-pagamentos`.
- [ ] **Análise de fonte de recurso** — dependência de transferências
  (próprios R$ 48M vs FUNDEB/SUS/convênios); seções por fonte já existem
  na página de categoria, falta a visão dedicada.
- [ ] **Cruzamento emendas × empenhos** (`emendas-repo` já existe).
- [ ] **`dados_extras.coTce`** — acompanhamento TCE-MG por empenho.
- [ ] **Busca unificada multi-índice na navbar** (documentos + empenhos);
  hoje /acervo oferece link contextual pra busca de empenhos.
- [ ] **Detector de gasto atípico no scheduler** — hoje CLI manual;
  integrar ao ciclo diário de descobertas quando o tom estiver validado
  com o feed real.

- [x] **Backfill despesas 2019–2022** (06/07) — `ANO_INICIO` virou
  `config.transparenciaAnoInicio` (`TRANSPARENCIA_ANO_INICIO`, default 2019)
  e a coleta histórica foi disparada. Atenção: a coleta diária agora percorre
  2019+ (o skip é por dia, anos fechados são re-coletados a cada ciclo — o
  custo subiu; otimizar o skip de anos fechados é follow-up se pesar).
- [x] **Vinculação empenho↔licitação** (28/08) — número "13–23%" acima estava
  desatualizado (pré-PR#16). Real hoje: 68,7% das despesas com modalidade
  parseável têm documento (3.324/4.840). Dos 1.516 sem vínculo, investigados
  a fundo: 1.004 "adesão" + 512 dispensa/inexigibilidade/pregão/tomada
  (concentrados em 2022–2023) são gap real da fonte (confirmado ao vivo no
  site — zero registros desses tipos nesses anos na listagem oficial), não
  bug de linking. Não há mais matching a fazer sem inventar vínculo.
- [ ] **Monitoração recorrente de deep-links** — o portal devolve **403 a IPs
  de datacenter** (VM Oracle e runners do GitHub, confirmado 07/10/2026; os
  links abrem normalmente de rede residencial: 12/12). O check do
  daily-scheduler na VM dava falso 403 (19/09). Interim: tarefa agendada
  semanal na máquina do mantenedor (`scripts/check-portal-links.js`);
  `.github/workflows/portal-links.yml` é só manual. **Definir um modelo de
  observabilidade** que rode fora de datacenter (ex.: Worker/proxy residencial).

## ⏳ Pendente — Confirmar efeito do fix de cache pós-crawler (17/09/2026)

Continuação do achado de 02/09 (PR #44, ISR em `/empenho/[id]` e
`/credores/[cnpj]`): em 17/09 achado que o **resto** das páginas públicas
(`/acervo`, `/legislacao`, `/transparencia`, etc.) tinha o mesmo problema
por uma causa diferente — `dynamic = 'force-dynamic'` zerava o
`next.revalidate` de todo fetch da rota, então o cache que já existia em
`lib/api.js` nunca funcionou. Corrigido via `unstable_cache` (PR #74).
Crawler confirmado ao vivo (rajada de 6+ req/6s em `/acervo`, sem
`Crawl-delay` no `robots.txt`).

- Sem task agendada desta vez (a de 04/09 expirou sem deixar resultado
  registrado aqui — sessões anteriores não persistem `ScheduleWakeup`/cron
  entre si). Checar manualmente em
  vercel.com/henriqueogs-projects/monitor-ritapolis/observability/edge-requests
  daqui a alguns dias, comparando com o volume de hoje.
- VM: swap estava sob pressão real hoje (thrashing confirmado via
  `vmstat`), causa dupla (schedulers concorrentes + crawler sem cache).
  Ambas corrigidas (PRs #73, #74) + `vm.swappiness=10` + timer semanal de
  restart. **Reconfirmar em alguns dias** que a pressão não voltou.

## ⏳ Em andamento — Campanha de resumos históricos + OCR da Câmara (07/10/2026)

Ver `docs/CAMPANHA_RESUMOS_HISTORICOS.md` (limites do provedor medidos, etapas,
monitoramento `campanha_*` em `/api/saude/pipeline`, rollback). Etapa 2 ativa
(200 docs/dia, 4 h). OCR local → JSON → `aplicar-ocr-exportado.js` na VM (casa
por `url_pdf`); Câmara: leis, portarias e atas aplicadas; restam indicações,
resoluções, requerimentos, leis complementares e Prefeitura (53 imagens).
Também em 07/10: diárias de show/som não contam mais como diária de servidor
(`finalidade-v3`), folha unifica Departamento→Secretaria (1:1), gates de
qualidade contam como revisão no health.

## ⏳ Pendente — Na Lupa: scheduler de promoção pausado

**07/10/2026:** processamento manual na VM em lotes de 20
(`descobertas:investigar --limite=20 --delay-ms=5000`); publicação automática
segue desligada, tudo vai para `revisao` (aprovação humana no admin). Mantenedor
avalia a fila antes de novos lotes e de religar os schedulers.

`DESCOBERTAS_SCHEDULER_ENABLED=false` desde jul/2026 (confirmado em
produção 17/09/2026). 211 candidatos parados em `estado_editorial=
'candidato'`, só 1 público (#57). O ciclo incremental do `ai-daily-
scheduler` continua gerando/atualizando candidatos, mas nunca promove —
isso exige o ciclo factual+investigação dedicado do `descobertas-
scheduler.js`. Retomar: rodar `descobertas:processar --force` com o
provider de IA fresco e confirmar estabilidade antes de religar o flag.

## Backlog menor (baixa prioridade, sem prazo)

- ~~`/temas` → virar filtro de `/licitacoes`; `/analises` redirecionar~~ —
  **item obsoleto, verificado e descartado em 17/09/2026**: a premissa
  ("páginas órfãs, fora da navegação") está errada. As duas estão
  ativamente linkadas em `NavLinks.js`, dentro do dropdown "Dinheiro
  público" (`temas`/`analises` como filhos) — comentário no código
  confirma que foram deliberadamente mantidas lá numa reorganização de nav
  posterior a esta nota. Não remover.
- Ver `DEVELOPMENT_PLAN.md` §6 (Roadmap) para o backlog completo — detecção
  de PDF-imagem (testes unitários, scheduler, UI admin), portal de
  transparência financeira, alertas públicos por e-mail/WhatsApp, etc.

---

## Como retomar

```bash
npm start              # API :3001 + frontend :3000
npm run setup-db        # 1x por clone/worktree: sem isso ~11 suites falham com "no such table: main.alertas"
npm test                # suíte completa (1492 testes em 15/10/2026)
```

Ordem de leitura pra retomar contexto: `QUICK_SUMMARY.md` → este arquivo →
`DEVELOPMENT_PLAN.md` (se precisar de histórico/arquitetura) →
`CLAUDE.md` (padrões, obrigatório antes de codar).

## Fase 3 (núcleo agnóstico) — passo 1: ente como configuração

- [x] `src/ente.js` (nome, UF, IBGE, CNPJs, órgãos; valida na carga) lê `MUNICIPIO_NOME`, `UF_MUNICIPIO`, `IBGE_CODE`, `CNPJ_PREFEITURA`, `CNPJ_CAMARA`; `frontend/lib/ente.js` espelha CNPJ da Prefeitura e IBGE para o frontend.
- [x] Literais trocados em: coletor do PNCP, exclusão de concentração, parsers de licitação, integração PNCP (UF), diagnóstico do PNCP, tela de credores e contexto da cidade.
- [x] Guarda `tests/ente-sem-literal.test.js`: CNPJ/UF/IBGE literal fora da configuração derruba o teste. Exceções justificadas: 2 regex de cabeçalho de PDF (`licitacao-resultados-itens.js`, `licitacao-produtos.js`) e um script histórico de fornecedores.
- [x] Passo 2: os 3 textos de IA que citavam a cidade (prompt do RAG, prompt e narrativa "sem anomalias" de `anomaly-narrative.js`) usam o ente via `src/ai/prompts/ente-texto.js`; `VERSAO_PROMPT` = `rag-resposta-v2`; `tests/ente-sem-literal.test.js` falha se `src/ai` voltar a citar o nome à mão. Eval real antes/depois (mesmo modelo): sem regressões.
- [x] Passo 3 (pontos centrais do frontend): `frontend/lib/ente.js` concentra nome, UF, marca, domínios e hosts das fontes; metadados de página (`page-metadata.js`), textos do layout (`site-metadata.js`), `brand.js`, `disclaimer.js` e `source-links.js` só leem dele. Textos idênticos com o ente padrão (testes dourados + caracterização do `source-links` antes/depois) e guarda em `tests/frontend-ente-central.test.js`. **Fora do escopo:** textos de página (~30 arquivos de títulos/SEO por tela), `CityContext`, `emendas`, `StatusColeta`, `EmpenhoSection`, `OrigemBadge`, CSP/`next.config.js`.
- [x] Repositório-modelo (ADR 0007): identidade do município em `municipios/<slug>/municipio.json`, escolhida por `MUNICIPIO`; `src/config.js` sem literais; `municipios/_exemplo/` para copiar.
- [x] Repositório-modelo, item 1: `docker compose up --build` sobe API + site com `municipios/_exemplo/` e 9 documentos fictícios (`npm run seed:exemplo`, `src/demo/`), sem coleta nem IA.
- [x] Repositório-modelo, item 2: `municipio.json` com marca e domínios; o frontend lê `frontend/lib/municipios.json` (`npm run municipio:frontend`) e escolhe por `NEXT_PUBLIC_MUNICIPIO`; `pncp:sincronizar:*` usam `--orgao` em vez de CNPJ.
- [ ] Próximos passos da Fase 3: textos de página do frontend via ente; contrato `Coletor`; parâmetros por porte (ver mapa genérico vs. Ritápolis, PR #169).
