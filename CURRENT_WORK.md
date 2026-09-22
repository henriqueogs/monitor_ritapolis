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
- [ ] **Monitoração recorrente de deep-links** — integrar
  `npm run transparencia:validar-links` ao daily-scheduler (amostra ~5) com
  alerta em log se o portal mudar o contrato de URL. Rodar manual/mensal até lá.

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

## ⏳ Pendente — Na Lupa: scheduler de promoção pausado

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
npm test                # suíte completa (1041 testes em 18/09/2026)
```

Ordem de leitura pra retomar contexto: `QUICK_SUMMARY.md` → este arquivo →
`DEVELOPMENT_PLAN.md` (se precisar de histórico/arquitetura) →
`CLAUDE.md` (padrões, obrigatório antes de codar).
