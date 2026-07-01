# ▶ COMECE AQUI — Monitor Ritápolis

Ponto de entrada para retomar o projeto. Leia nesta ordem:

1. **[`CURRENT_WORK.md`](CURRENT_WORK.md)** — foco imediato + **handoff** (seção
   "▶ Como retomar"): estado do Git, o que está pronto sem commit, o que falta
   validar, próximos passos. **É a fonte da verdade do que fazer agora.**
2. **[`.specs/STATE.md`](.specs/STATE.md)** — milestone de publicação
   (`publicacao-mvp`), fluxo spec-driven. Rascunho aguardando sua confirmação.
3. **[`DEVELOPMENT_PLAN.md`](DEVELOPMENT_PLAN.md)** — roadmap e histórico de versões.
4. **[`CLAUDE.md`](CLAUDE.md)** — padrões de desenvolvimento (DDD, TDD, limites de
   arquivo, regras de produto §11). Obrigatório antes de codar.

## Estado em uma frase (2026-07-01)

Descobertas v1 (thresholds afináveis em `/admin/alertas` + redesign da UI) **prontas
sem commit**; subsistema **Descobertas v2** (investigação IA + inteligência de
fatos) e **MVP de publicação** em andamento; **árvore de trabalho grande sem
commit** — triar e commitar é a ação #1 (ver `CURRENT_WORK.md`).

## Setup

```bash
npm start     # API :3001 + frontend :3000
npm test      # 462 testes / 43 suites (verde em 01/07)
```

Páginas-chave: `/descobertas`, `/admin/alertas`.

---

> Docs de tópico único (histórico): `IMPROVEMENTS_IMAGE_PDF_DETECTION.md`,
> `TODO_IMAGE_PDF_DETECTION.md`, `COBERTURA.md`, `New_work.md`. Consulte só se o
> assunto for relevante — o estado atual vive em `CURRENT_WORK.md`.
