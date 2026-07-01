# Plano: Gerador de Alertas de Inteligência (Insights Recorrentes)

## TL;DR
Criar um pipeline recorrente que analisa os resumos IA já existentes em
`documentos_resumos_ai`, agrupa documentos por tema/categoria e por processo,
detecta padrões (repetição temática, risco alto, valores relevantes, anomalias
temporais, lacunas/questionamentos) e gera **alertas** com narrativa em
linguagem natural + metadados estruturados. Os alertas são persistidos em nova
tabela, expostos via API e exibidos na Home pública, na página de Inteligência
e no Admin. Gatilhos e thresholds são configuráveis via Admin.

---

## Decisões (do alinhamento com o usuário)
- **Granularidade**: híbrida — alertas temáticos agregados (ex: "cortes de
  árvores em 2026") + alertas por processo quando há risco/anomalia.
- **Gatilhos**: repetição temática, risco alto no resumo IA, valor monetário
  relevante, anomalias temporais, questionamentos abertos. **Todos
  configuráveis no Admin.**
- **Formato**: narrativa em linguagem natural + JSON estruturado (documentos
  vinculados, valores, datas, severidade, questionamentos).
- **Canais**: Home pública (destaque), página de Inteligência, Admin.
- **Frequência**: pós-processamento do `ai-daily-scheduler` (após novos
  resumos), + script manual para testes.
- **Escopo MVP**: completo (backend + API + frontend).

## Regras de produto (CLAUDE.md) que aplicam
- 11.1: valores monetários sempre escopados por intervalo de tempo.
- 11.2: ordenar por `data_publicacao`, nunca `coletado_em`.
- 11.3: rastreabilidade — todo alerta referencia `url_origem` dos documentos.

---

## Arquitetura

```
ai-daily-scheduler.runCycle()
    ↓ (pós resumos novos)
alert-generator.generateAlerts({ since })
    ↓
1. Coleta resumos novos/atualizados desde último ciclo
2. Agrupa por (categoria + ano) e por (grupo_processo)
3. Aplica detectores (cada um = função pura em src/alertas/detectores/)
   → emite "sinais" estruturados
4. Consolida sinais em alertas candidatos
5. Para alertas temáticos: chama LLM (provider existente) p/ narrativa
6. Persiste em alertas_licitacoes (upsert idempotente por chave)
7. Atualiza watermark (última análise) em alertas_watermark
```

---

## Passos (fases)

### Fase 1 — Schema e Repositório (fundação)
1. Adicionar tabelas em `src/db/schema.sql`:
   - `alertas` — id, tipo (`tematico`|`processo`), categoria, subcategoria,
     severidade (`info`|`atencao`|`critico`), titulo, narrativa, metadados_json,
     periodo_inicio, periodo_fim, valor_total, valor_periodo_label,
     documentos_ids_json, questionamentos_json, confianca, status
     (`ativo`|`arquivado`|`suprimido`), chave_unica (UNIQUE), criado_em,
     atualizado_em, ultima_publicacao_documento.
   - `alertas_documentos` — N:N (alerta_id, documento_id, papel, trecho_fonte).
   - `alertas_watermark` — chave (UNIQUE), ultimo_processado_em, total_gerados.
   - `alertas_config` — chave (UNIQUE), valor_json, descricao, editavel.
2. Criar `src/db/alertas-repo.js` com CRUD + `upsertAlerta`, `listarAlertas`,
   `getWatermark`, `setWatermark`, `getConfig`, `setConfig`.
3. Migração idempotente em `src/db/migrations/` (se houver padrão) ou
   `CREATE TABLE IF NOT EXISTS` no schema.

### Fase 2 — Detectores (domain logic, funções puras)
*parallel com Fase 1 para testes*
4. Criar `src/alertas/detectores/` com um módulo por gatilho:
   - `repeticao-tematica.js` — dado conjunto de resumos agrupados por
     (categoria, ano), emite sinal se count ≥ threshold (default 2).
   - `risco-alto.js` — emite sinal para resumos com `riscos_ou_alertas[].nivel
     === 'alto'`.
   - `valor-relevante.js` — soma valores por (categoria, ano); sinal se ≥
     threshold (default configurável).
   - `anomalia-temporal.js` — detecta picos (ex: aditivos sucessivos, mês com
     n× contratações vs média histórica).
   - `questionamentos.js` — heurísticas + LLM: identifica lacunas ("corte sem
     projeto", "sem análise ambiental", "aditivo sem justificativa").
5. Criar `src/alertas/agrupador.js` — agrupa resumos por (categoria, ano) e
   por `grupo_id` (de `licitacoes_grupo_documentos`).
6. Criar `src/alertas/consolidador.js` — recebe sinais + agrupamentos, produz
   alertas candidatos com metadados (documentos, valores, datas, período).
7. **TDD**: testes em `*.test.js` ao lado de cada detector e do consolidador.

### Fase 3 — Narrativa IA
8. Criar `src/ai/prompts/alert-narrative-prompt.js` — `buildAlertNarrativePrompt({
   tipo, categoria, documentos, valores, periodo, questionamentos })` seguindo
   padrão de `document-summary-prompt.js`.
9. Criar `src/ai/alert-narrative.js` — `gerarNarrativaAlerta({ ... })` chama
   `provider.generateJson()` (mesmo padrão de `correlate-licitation.js`),
   valida com Zod, retorna `{ titulo, narrativa, questionamentos }`.
10. **TDD**: teste com provider mockado.

### Fase 4 — Orquestrador
11. Criar `src/alertas/alert-generator.js` — `generateAlerts({ since } = {})`:
    - Lê watermark; se `since` omitido, usa watermark.
    - Query resumos novos via `documentos_resumos_ai` JOIN `documentos` ON
      `d.atualizado_em > since` (ou `ra.criado_em > since`).
    - Agrupa, roda detectores, consolida.
    - Para cada alerta candidato: gera narrativa IA (se temático) ou monta
      narrativa template (se processo).
    - Upsert em `alertas` + `alertas_documentos`.
    - Atualiza watermark.
12. Criar `scripts/gerar-alertas.js` — CLI: `node scripts/gerar-alertas.js
    [--since=ISO] [--dry-run] [--limite=N]`.
13. Adicionar `npm run alertas:gerar` no `package.json`.

### Fase 5 — Integração com Scheduler
14. Em `src/ai/ai-daily-scheduler.js`, após `extractEntitiesFromResumes()`,
    chamar `generateAlerts()` (envolver em try/catch, logar, não derrubar
    ciclo).
15. Adicionar config em `src/config.js`: `alertasEnabled`,
    `alertasSchedulerEnabled`, `alertasMinRepeticao`, `alertasValorThreshold`,
    `alertasLimitePorCiclo`.

### Fase 6 — API
16. Em `src/api/server.js` (ou extrair para `src/api/routes/alertas.js` se
    preferir modularizar), adicionar rotas:
    - `GET /api/alertas` — lista paginada (filtros: tipo, categoria, severidade,
      periodo, status).
    - `GET /api/alertas/:id` — detalhe com documentos vinculados.
    - `GET /api/alertas/destaques` — top N para home (ativos, ordenados por
      `ultima_publicacao_documento DESC`).
    - `PATCH /api/alertas/:id` — alterar status (arquivar/suprimir).
    - `GET /api/alertas/config` — ler configurações.
    - `PATCH /api/alertas/config` — atualizar thresholds (admin).
    - `POST /api/alertas/gerar` — dispara geração manual (admin).
17. **TDD**: testes de integração com supertest.

### Fase 7 — Frontend
18. Criar `frontend/app/_home/AlertasDestaque.js` — componente de destaques na
    home (cards com título, narrativa curta, severidade, link para detalhe).
19. Criar `frontend/app/alertas/page.js` — lista filtrável (categoria,
    severidade, período).
20. Criar `frontend/app/alertas/[id]/page.js` — detalhe: narrativa completa,
    documentos vinculados (com `url_origem`), valores escopados por período,
    questionamentos.
21. Adicionar seção "Alertas" em `frontend/app/inteligencia/page.js`.
22. Adicionar painel em `frontend/app/admin`:
    - Status do gerador (watermark, último ciclo, total de alertas).
    - Editor de configurações (thresholds, gatilhos on/off).
    - Lista de alertas para arquivar/suprimir.
23. **TDD**: testes de componentes com RTL.

### Fase 8 — Verificação e Documentação
24. Rodar `npm run lint && npm test -- --coverage`.
25. Atualizar `DEVELOPMENT_PLAN.md` e `README.md` com nova feature.
26. Atualizar `CURRENT_WORK.md`.

---

## Arquivos relevantes

### A criar
- `src/db/alertas-repo.js` — repositório (CRUD, upsert, watermark, config).
- `src/alertas/detectores/repeticao-tematica.js`
- `src/alertas/detectores/risco-alto.js`
- `src/alertas/detectores/valor-relevante.js`
- `src/alertas/detectores/anomalia-temporal.js`
- `src/alertas/detectores/questionamentos.js`
- `src/alertas/agrupador.js`
- `src/alertas/consolidador.js`
- `src/alertas/alert-generator.js`
- `src/ai/prompts/alert-narrative-prompt.js`
- `src/ai/alert-narrative.js`
- `scripts/gerar-alertas.js`
- `frontend/app/_home/AlertasDestaque.js`
- `frontend/app/alertas/page.js`
- `frontend/app/alertas/[id]/page.js`
- Testes `*.test.js` ao lado de cada módulo.

### A modificar
- `src/db/schema.sql` — adicionar tabelas `alertas`, `alertas_documentos`,
  `alertas_watermark`, `alertas_config`.
- `src/ai/ai-daily-scheduler.js` — chamar `generateAlerts()` pós-ciclo.
- `src/config.js` — configs de alertas.
- `src/api/server.js` — rotas de alertas.
- `package.json` — script `alertas:gerar`.
- `frontend/app/_home/page.js` — incluir `AlertasDestaque`.
- `frontend/app/inteligencia/page.js` — seção alertas.
- `frontend/app/admin/page.js` — painel de alertas.
- `DEVELOPMENT_PLAN.md`, `README.md`, `CURRENT_WORK.md`.

### Padrões de referência (reutilizar)
- `src/ai/correlate-licitation.js` — padrão de chamada LLM + validação Zod +
  persistência idempotente.
- `src/ai/ai-daily-scheduler.js` — padrão de scheduler cíclico.
- `src/ai/anomaly-narrative.js` — padrão de narrativa IA.
- `src/ai/prompts/document-summary-prompt.js` — padrão de prompt builder.
- `src/licitacoes/categoria.js` — categorização por keyword (reutilizar para
  agrupamento temático).
- `src/db/ai-jobs-repo.js` — padrão de repositório com status/watermark.
- `src/db/documentos-repo.js` — `buildQualidadeAlertas`, helpers de origem.

---

## Verificação

1. **Unit (TDD)**: cada detector e o consolidador têm testes cobrindo casos
   positivos, negativos e edge cases (ex: resumo sem valores, categoria
   "Outros"). Cobertura ≥ 85% em `src/alertas/`.
2. **Integração DB**: testar `alertas-repo.js` com SQLite `:memory:` — upsert
   idempotente, watermark, config.
3. **IA mockada**: `alert-narrative.test.js` com provider mockado valida
   contrato da narrativa.
4. **API**: supertest em rotas `GET /api/alertas`, `GET /api/alertas/:id`,
   `PATCH /api/alertas/:id`, `GET/PATCH /api/alertas/config`.
5. **Frontend**: RTL em `AlertasDestaque`, página de lista e detalhe.
6. **E2E (Playwright)**: fluxo "home mostra alerta → clica → vê detalhe com
  documentos vinculados e url_origem".
7. **Manual**: rodar `npm run alertas:gerar -- --dry-run` e validar alertas
   gerados a partir dos resumos existentes (ex: cortes de árvores 2026).
8. **Regras de produto**: verificar que valores exibidos têm período, ordenação
   por `data_publicacao`, e todo alerta tem link para `url_origem`.
9. `npm run lint && npm test` verdes.

---

## Escopo — incluído vs. excluído

### Incluído
- Pipeline completo de geração de alertas (detectores → consolidação →
  narrativa IA → persistência).
- 5 detectores cobrindo os gatilhos selecionados.
- Configuração de thresholds/gatilhos via Admin.
- API REST + frontend (home, lista, detalhe, inteligência, admin).
- Integração com scheduler existente.
- Testes unitários, de integração, de componentes e E2E.

### Excluído (futuro)
- Notificação por e-mail/WhatsApp (apenas UI por ora).
- Assinatura de alertas por cidadão (personalização).
- Reanálise automática de alertas arquivados quando novos docs chegam.
- ML/clusterização semântica além da categorização por keyword existente.
- Seletor de intervalo de tempo nas telas de valores (já listado como feature
  futura no CLAUDE.md 11.1).

---

## Further Considerations

1. **Chave de idempotência do alerta**: recomendo `tipo|categoria|ano|chave_temática`
   (hash dos documentos_ids ordenados) para que o mesmo conjunto de documentos
   não gere alerta duplicado, mas adicione documentos novos ao alerta existente.
   Alternativa: regenerar sempre e marcar o anterior como superseded. — **Optar
   por upsert por chave temática** (recomendado).

2. **Custo de IA**: gerar narrativa para todo alerta pode ser caro. Recomendo
   gerar narrativa IA apenas para alertas temáticos agregados (poucos por
   ciclo) e usar templates para alertas de processo. Confirmar na execução.

3. **Questionamentos abertos**: a IA pode alucinar. Recomendo que
   questionamentos gerados pela IA sejam sempre vinculados a `trecho_fonte`
   dos resumos e marcados com `confianca`. Se confiança < threshold, exibir
   como "pergunta em aberto" sem afirmar. Validar na Fase 3.
