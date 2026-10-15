# ADR 0006 — Avaliação (evals) como gate de qualidade

**Status:** proposto

## Contexto
Sem medição não há como trocar modelo, prompt ou chunking com segurança.

## Decisão
Conjunto "ouro" versionado em `tests/evals/` (pergunta, fontes esperadas, resposta de
referência, ou "deve recusar"). Métricas: recall@k da recuperação, fidelidade (groundedness),
acerto de citação, taxa de recusa correta. Recuperação roda no CI (offline, sem LLM);
geração roda sob demanda (`npm run eval:ia`) por custo. Mudança em prompt/chunking/modelo
exige relatório antes/depois no PR.

## Consequências
+ Regressões visíveis; decisões baseadas em dados. − Curadoria manual inicial (30–50 perguntas).
