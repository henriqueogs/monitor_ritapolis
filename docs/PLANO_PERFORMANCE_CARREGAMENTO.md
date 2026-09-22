# Plano — Site lento pra iniciar (carregamento da home / primeira requisição)

Diagnóstico feito em 18/09/2026 com medições reais (produção + local). Este
documento é a especificação pra quem for implementar. Seguir `CLAUDE.md`
(TDD, DDD, limites de tamanho) em toda mudança.

---

## 1. Diagnóstico (evidências)

**Não é o boot do processo.** Boot local da API: `setupDatabase()` 130 ms,
`require('src/api/server')` 1,1 s, reconciliação `crosswalkDespesasDocumentos`
percorre só 70 linhas. Total < 2 s. Não gastar tempo aqui.

**É a primeira renderização da home (e de páginas com agregados) a cada
expiração de cache.** Medições `curl` em produção (18/09, ~20h BRT):

| Alvo | 1ª chamada (cache frio) | 2ª chamada (quente) |
|---|---|---|
| `GET https://ritapolis.com/` | TTFB 1,1 s, **total 8,1 s** | total 0,57 s |
| `GET api/painel-cidadao` | 3,5 s | 1,8 s |
| `GET api/transparencia/resumo?mandato=2026` | **5,4 s** | **10,4 s** |
| `GET api/documentos?tipo=lei_ordinaria&limite=1` | 0,17 s | 2,1 s (*) |

(*) chamada trivial ficou 2 s porque o Node é single-thread e a query pesada
do `resumo` bloqueia o event loop da VM (1 OCPU) — qualquer request que chega
durante um agregado espera.

Local (mesmo banco, 308 MB): `getPainelTransparencia` 1,6 s frio → 0,16 s
quente; `getPainelCidadao` 1,1 s frio → 0,24 s quente. Ou seja, o custo é
dominado por I/O de página do SQLite com cache default de 2 MB
(`PRAGMA cache_size = -2000`, `mmap_size = 0`) numa VM de 1 GB.

### Causas raiz, em ordem de impacto

1. **Home espera 5 requisições HTTP sequenciais à Prefeitura antes de renderizar.**
   `frontend/app/_home/components/PrefeituraAutoSync.js` é um *server
   component* que faz `await syncPrefeituraOnPortalOpen()` →
   `POST /api/coletas/sincronizar-prefeitura` → `checkPrefeituraSyncOnPortalOpen()`
   (`src/coletas/prefeitura-sync.js`) percorre `ColetorSitePrefeitura.AREAS`
   (5 áreas) **em série**, 2 requests por área. Medido: **9,1 s em 10 requests**.
   Resultado é cacheado em memória por 10 min (`prefeituraSyncCheckIntervalMs`),
   então o primeiro visitante de cada janela de 10 min paga ~9 s — e os logs do
   Vercel mostram `/` sendo requisitada a cada ~30 s (crawlers), todas `cache=MISS`.
   Nada disso é `no-store` por acidente: o POST nunca entra no `unstable_cache`.

2. **Agregados pesados sem cache no lado da API.** `/api/transparencia/resumo`,
   `/api/painel-cidadao`, `/api/estatisticas` (e `/api/inteligencia/*`,
   `/api/transparencia/gastos`) recalculam `GROUP BY` sobre 30 k empenhos a cada
   chamada. Só existe cache no Next (`unstable_cache`, 120 s), que expira rápido
   e é por região/instância. Cada expiração = 4 chamadas à API, uma delas de 5–10 s.

3. **SQLite com cache de página mínimo.** `src/db/connection.js` só seta WAL,
   FKs e `busy_timeout`. Sem `cache_size`/`mmap_size`, cada agregado relê o
   banco do disco da VM.

4. **Function do Vercel roda em `iad1` (EUA), API em São Paulo.** Header
   `x-vercel-id: gru1::iad1::…` — a borda atende em SP, mas a função executa
   em Washington e faz 4 round-trips TLS pra `api.ritapolis.com` (sa-saopaulo-1).
   ~150 ms de RTT por request, multiplicado.

5. **Caches em memória morrem a cada restart** (deploy a cada merge + timer
   semanal de restart na VM). Sem warm-up, o primeiro acesso após deploy paga
   tudo de novo.

---

## 2. Fases (checklist)

Cada fase é independente e entregável sozinha, em PR próprio. Ordem = impacto.

### Fase 0 — Baseline (antes de tocar em código)

- [ ] Rodar e guardar no PR:
  ```bash
  for u in "https://ritapolis.com/" "https://api.ritapolis.com/api/transparencia/resumo?mandato=2026" "https://api.ritapolis.com/api/painel-cidadao"; do curl -s -o /dev/null -A "Mozilla/5.0 perf" -w "%{http_code} ttfb=%{time_starttransfer} total=%{time_total} $u\n" "$u"; done
  ```
  Rodar 2× seguidas (frio/quente). Repetir ao final de cada fase.

### Fase 1 — Tirar a verificação da Prefeitura do caminho da renderização (maior ganho) ✅

**Objetivo:** home nunca espera a Prefeitura. Manter a funcionalidade
"abrir o portal dispara verificação/coleta".

Backend (`src/coletas/prefeitura-sync.js`):
- [x] Teste primeiro (`prefeitura-sync.test.js`, mockar `ColetorSitePrefeitura`):
  - `checkPrefeituraSyncOnPortalOpen()` responde em < 50 ms mesmo com o
    coletor mockado pra demorar 2 s por área (retorna `{ status: 'verificando' }`
    ou o último resultado conhecido, e dispara a verificação em background).
  - segunda chamada enquanto a verificação roda não inicia outra (flag
    `state.checking`).
  - as 5 áreas são consultadas em paralelo (`Promise.all`/`allSettled`), não em série.
- [x] Implementar: verificação em background com `state.checking`; áreas em
  paralelo (`Promise.allSettled`). Timeout por request já existia
  (`config.collectorTimeoutMs`, 15 s, no `axios.create` de `ColetorBase`) —
  não duplicado. Resposta imediata: último resultado + `verificando: true`.
- [x] Rota `POST /api/coletas/sincronizar-prefeitura` passa a responder `202`
  quando disparou verificação em background (contrato: campo `verificando`).

Frontend:
- [x] `PrefeituraAutoSync` vira **client component** (`'use client'`) que
  chama `syncPrefeituraOnPortalOpen()` dentro de `useEffect` **sem await no
  render** (fire-and-forget, `.catch(() => null)`). Nenhum dado dele é usado
  na tela hoje.
  - **Achado ao testar (18/09)**: virar client-side quebrou uma coisa que o
    server component escondia de graça — `RequestToaster.js` intercepta
    `window.fetch` global e mostra toast pra toda mutação `/api/`; como
    `/api/coletas/sincronizar-prefeitura` sempre exige sessão admin
    (`security.js` classifica como `expensiveJob`; visitante anônimo nunca
    teve — isso não é novo, sempre foi assim), todo visitante passou a ver
    um toast vermelho "Requisição falhou · 401" na home. Corrigido excluindo
    essa rota da instrumentação de toast (`ROTAS_SILENCIOSAS` em
    `RequestToaster.js`) — é verificação em background, não ação do usuário.
- [x] Contrato em `frontend/app/_home/page.test.js` atualizado (projeto não
  roda Jest real sobre `frontend/` ainda — arquivo é doc de contrato, não
  suite executável; ver Prioridade 1 do backlog).

**Aceite:** confirmado em produção 22/09: `total` = 0,42 s (era 8,1 s).

### Fase 2 — Cache em memória dos agregados na API ✅

**Objetivo:** `resumo`/`painel-cidadao`/`estatisticas` custam ~0 ms depois da
primeira chamada; recalcular só quando os dados mudam.

- [x] Criado `src/utils/memo-ttl.js` (28 LOC): `memoTtl(fn, { ttlMs, key })`
  retorna wrapper com `.invalidate()`; guarda `{ value, expiresAt }` num `Map`.
  Teste `memo-ttl.test.js` com `jest.useFakeTimers()`: hit dentro do TTL, miss
  após, `invalidate()` força recomputo, chaves diferentes não colidem.
- [x] Aplicado nos serviços (camada de domínio, não nas rotas):
  `getPainelTransparencia` (`src/transparencia/painel-service.js`),
  `getGastosPanorama` (`src/transparencia/gastos-service.js`),
  `getPainelCidadao`/`getEstatisticas`/`getInteligenciaPanorama`/`getCoberturaPorAno`
  (monólito — envolvidos em `src/services/painel-cidadao-service.js` novo, sem
  mexer em `src/db/index.js`). TTL 10 min.
- [x] Invalidação: `src/services/cache-registry.js` (`registrar`/`invalidarTodos`)
  chamado ao fim de coleta bem-sucedida em `update-runner.js` (cobre
  collection-scheduler, `/api/coletas/atualizar` manual e o trigger da Fase 1)
  e em `daily-scheduler.js` (transparência + folha).
- [x] `Cache-Control: public, max-age=60, s-maxage=600, stale-while-revalidate=3600`
  em `/api/estatisticas`, `/api/painel-cidadao`, `/api/transparencia/resumo`,
  `/api/transparencia/gastos`, `/api/inteligencia/panorama`, `/api/inteligencia/cobertura`.
- [x] `frontend/app/lib/api.js`: `revalidate: 600` nas chamadas desses 6
  agregados (mantido 120 no resto via `REVALIDATE_PADRAO_S`).

**Aceite:** confirmado em produção 22/09: `Cache-Control: s-maxage=600`
presente na resposta; total via internet 300–650 ms (dominado por RTT/TLS,
não pelo cálculo do agregado — era 5,4–10,4 s).

### Fase 3 — SQLite: cache de página + warm-up ✅

- [x] `src/db/connection.js`: `cache_size`/`mmap_size`/`temp_store` via
  `config.sqliteCacheKb` (default 65536 KB = 64 MB) e `config.sqliteMmapBytes`
  (default 256 MB), env `SQLITE_CACHE_KB`/`SQLITE_MMAP_BYTES`. Teste
  `connection.test.js` (`:memory:`) confirma os pragmas aplicados.
- [x] Warm-up no boot: `scripts/api.js` chama `warmUpAgregados()`
  (`src/services/painel-cidadao-service.js`, novo) em `setImmediate` depois
  de `startServer()`, com try/catch + log. Popula os 6 agregados da Fase 2
  (monólito + `getPainelTransparencia` + `getGastosPanorama`).
- [x] Verificado após deploy (22/09, `gh workflow run vm-capacity-check.yml`):
  `memAvailableMb: 261`, `memUsedPercent: 73`, status `ok` — bem acima do
  limiar de 150 MB, não precisou reduzir `cache_size`.

**Aceite:** confirmado indiretamente (memória disponível saudável pós-warm-up;
sem acesso direto a medir só a função no shell da VM neste passo).

### Fase 4 — Vercel: função na mesma região da API ✅

- [x] Criado `frontend/vercel.json` com `{ "regions": ["gru1"] }`.
- [x] Verificado após deploy (22/09): `curl -sI https://ritapolis.com/ | grep
  x-vercel-id` → `gru1::gru1::nvr4q-…` — função saiu de `iad1`.
- [x] Confirmado via `grep -rn "no-store\|postJson" frontend/app --include=*.js
  | grep -v lib/api.js`: todo `fetch`/`no-store` fora de `lib/api.js` já vive
  em componente `'use client'` (`AuthControl`, `LogoutButton`,
  `CollectionUpdateAction`, etc.) ou em route handler (`app/api/**/route.js`)
  — nenhum *server component* aguarda POST/no-store no caminho de render.

**Aceite:** TTFB da home quente < 300 ms (hoje ~450 ms). Pendente medir em
produção após deploy.

### Fase 5 — Guardrail pra não regredir ✅

- [x] Teste E2E Playwright `tests/e2e/home-tempo.spec.js`: home responde
  (`domcontentloaded`) em < 3 s (aquece a rota do `next dev` numa 1a visita
  descartada, depois cronometra). Marcado `@perf` no título. Validado local:
  921ms quente.
- [x] Documentado em `CURRENT_WORK.md` a regra: nenhum server component pode
  aguardar chamada de rede que não seja leitura cacheada; side effects
  (sync, coleta, log) sempre client-side ou no scheduler.

---

## 3. O que NÃO fazer

- Não migrar VM/shape por causa disso (ver `docs/DEPLOY.md` — capacidade A1
  é gargalo real e o problema aqui é de código).
- Não mexer em `force-dynamic` das páginas (necessário; ver comentário em
  `frontend/app/lib/api.js` e `layout.js`).
- Não otimizar `setupDatabase`/migrações/`crosswalk` — medidos, irrelevantes.
- Não adicionar Redis/serviço externo de cache — `Map` em memória + warm-up
  resolve com 1 processo.

## 4. Arquivos envolvidos

| Fase | Arquivos |
|---|---|
| 1 | `src/coletas/prefeitura-sync.js` (+ test), `src/api/server.js` (rota `202`), `frontend/app/_home/components/PrefeituraAutoSync.js`, `frontend/app/_home/page.test.js`, `frontend/app/components/RequestToaster.js` (exclusão de toast) |
| 2 | `src/utils/memo-ttl.js` (+ test), `src/services/painel-cidadao-service.js` (novo), `src/services/cache-registry.js` (novo), `src/transparencia/painel-service.js`, `src/transparencia/gastos-service.js`, `src/api/server.js` (headers + trocar import), schedulers (invalidação), `frontend/app/lib/api.js` |
| 3 | `src/db/connection.js`, `src/config.js`, `scripts/api.js` |
| 4 | `frontend/vercel.json` (novo) |
| 5 | `tests/e2e/home-tempo.spec.js`, docs |
