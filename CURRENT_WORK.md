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
- Deploy concluído (28/08/2026, ver `docs/DEPLOY.md`): API em VM Oracle
  Cloud Always Free + systemd + Caddy (TLS automático), frontend na Vercel,
  deploy automático nos dois lados a cada merge em `master`. Migração saiu
  do Render (estourou banda grátis) — Cloudflare Workers/OpenNext pro
  frontend foi avaliado e descartado (Vercel resolveu sem upgrade de Next).
- Ainda em aberto: evolução da autenticação admin além do Basic Auth.

Já pronto, não bloqueia a decisão: Basic Auth em `/admin/*`
(`src/auth/admin-basic-auth.js` + `frontend/middleware.js`).

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
