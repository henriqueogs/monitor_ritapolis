# ▶ COMECE AQUI — Monitor Ritápolis

Ponto de entrada. Cada doc tem uma responsabilidade — não duplicam conteúdo
entre si (se encontrar números diferentes pro mesmo dado em dois lugares,
é bug de documentação, avise).

| Documento | Responsabilidade |
|---|---|
| **[`CURRENT_WORK.md`](CURRENT_WORK.md)** | **Status + pendências.** O que está genuinamente em aberto agora. Comece por aqui. |
| **[`DEVELOPMENT_PLAN.md`](DEVELOPMENT_PLAN.md)** | Definições do produto, arquitetura, histórico de versões, roadmap/backlog. |
| **[`COBERTURA.md`](COBERTURA.md)** | Números ao vivo do banco (auto-gerado — `npm run docs:dados`). Nunca editar à mão. |
| **[`README.md`](README.md)** | Como instalar/rodar, rotas, comandos. |
| **[`CLAUDE.md`](CLAUDE.md)** | Padrões de desenvolvimento (DDD, TDD, limites de arquivo, regras de produto §11). Obrigatório antes de codar. |
| **[`docs/archive/`](docs/archive/README.md)** | Planejamento/postmortem de features já concluídas — histórico, não referência de estado atual. |

## Setup

```bash
npm start     # API :3001 + frontend :3000
npm test      # suíte completa; consultar contagem no resultado atual
```

Páginas-chave: `/na-lupa`, `/admin/alertas`.

Última revisão operacional e prioridades:
[`docs/STATUS_DESENVOLVIMENTO_2026-11-04.md`](docs/STATUS_DESENVOLVIMENTO_2026-11-04.md).
