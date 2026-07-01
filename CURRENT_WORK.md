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
