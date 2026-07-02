# Current Work — Monitor Ritápolis

**Status + pendências.** Definições/arquitetura/histórico vivem em
`DEVELOPMENT_PLAN.md`; números ao vivo em `COBERTURA.md`. Este arquivo fica
enxuto de propósito — só o que está genuinamente em aberto agora. Trabalho
concluído sai daqui e vira uma entrada de histórico em `DEVELOPMENT_PLAN.md`
(ou é arquivado em `docs/archive/` se for detalhado demais pro histórico).

Ver `QUICK_SUMMARY.md` para o mapa geral dos documentos do projeto.

---

## ⏳ Pendente — Publicação (MVP), spec-driven em `.specs/`

Rascunho aguardando **sua confirmação** antes de avançar para Design/Tasks:

- Spec: [`.specs/features/publicacao-mvp/spec.md`](.specs/features/publicacao-mvp/spec.md)
- Estado: [`.specs/STATE.md`](.specs/STATE.md)
- Perguntas em aberto (ver spec): alvo de deploy, política de credenciais
  admin, frescor de dados esperado em produção.

Já pronto, não bloqueia a decisão: Basic Auth em `/admin/*`
(`src/auth/admin-basic-auth.js` + `frontend/middleware.js`).

## ⏳ Pendente — Build de produção + deploy

- [ ] Testar `next build && next start` em produção.
- [ ] Dockerizar backend + SQLite.
- [ ] Deploy (Railway/Fly.io backend + Vercel frontend) — alvo depende da
  decisão da spec acima.

## ⏳ Pendente — Transparência: dados e vinculação (pós Empenhos v2, 02/07/2026)

Entregue em 02/07 (Empenhos v2): página `/empenho/[id]`, painel "Pra onde
vai o dinheiro" por categoria cidadã (`/transparencia/categoria/[slug]`),
lista geral `/transparencia/empenhos` com busca FTS, PeriodoSelector
genérico e detector de gasto atípico nas Descobertas
(`npm run alertas:empenhos`, thresholds em /admin/alertas). Ficam:

- [ ] **Validar receita LOA antes de expor "% de execução"** — 2024:
  R$ 215M previsto vs R$ 29M executado é implausível pro porte do município
  (suspeita de dupla contagem apesar do filtro nível-1 em
  `getReceitasPorAno`). **Bloqueia** qualquer card novo de execução
  orçamentária em destaque.
- [ ] **Fila de pagamentos** — 390 empenhos liquidados e não pagos; seção
  "quem está esperando receber" (dados já no banco).
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

- [ ] **Backfill despesas 2019–2022** — probe confirmou dados na API SH3 pros
  4 anos (`node scripts/testar-sh3-anos-anteriores.js`, 16/16 janelas ok).
  Mover `ANO_INICIO` (src/coletores/portal-transparencia.js:29) pra
  `src/config.js` e rodar coleta histórica. Enquanto isso, 2022 aparece
  parcial (282 empenhos) nas telas.
- [ ] **Vinculação empenho↔licitação (13–23%)** — matching secundário via
  `licitacao_ref` + `vencedor_cnpj` = `credor_cnpj` em
  `src/licitacoes/modalidade.js` / `scripts/revincular-despesas.js`. TDD.
- [ ] **Monitoração recorrente de deep-links** — integrar
  `npm run transparencia:validar-links` ao daily-scheduler (amostra ~5) com
  alerta em log se o portal mudar o contrato de URL. Rodar manual/mensal até lá.

## Backlog menor (baixa prioridade, sem prazo)

- `/temas` → virar filtro de `/licitacoes`; `/analises` redirecionar (páginas
  órfãs, já fora da navegação).
- Ver `DEVELOPMENT_PLAN.md` §6 (Roadmap) para o backlog completo — detecção
  de PDF-imagem (testes unitários, scheduler, UI admin), portal de
  transparência financeira, alertas públicos por e-mail/WhatsApp, etc.

---

## Como retomar

```bash
npm start              # API :3001 + frontend :3000
npm test                # suíte completa (495 testes em 01/07/2026)
```

Ordem de leitura pra retomar contexto: `QUICK_SUMMARY.md` → este arquivo →
`DEVELOPMENT_PLAN.md` (se precisar de histórico/arquitetura) →
`CLAUDE.md` (padrões, obrigatório antes de codar).
