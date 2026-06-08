# Current Work — Monitor Ritápolis

Foco operacional imediato. Atualizar sempre que uma fase for concluída ou a prioridade mudar.

Atualizado em: 2026-06-08 — v0.7 concluído. Iniciando preparação para publicação e v0.8.

---

## Foco atual

**v0.8 — próximo**

1. **Autenticação `/admin`** — HTTP Basic Auth, usuário/senha em `.env`. Blocker para publicação ampla.
2. **Cobertura PNCP anos anteriores** — Executar `npm run pncp:sincronizar` para 2023–2025, enriquecer vencedores e valores.
3. **Deploy** — Testar build de produção (`next build`), dockerizar, publicar em cloud.

---

## v0.7 — Concluído (junho 2026)

### Schedulers automáticos

**Scheduler de coletas** (`src/coletas/collection-scheduler.js`)
- Verifica a cada hora se a última coleta tem mais de 12h; dispara automaticamente
- Configurável: `COLLECTION_SCHEDULER_INTERVAL_HOURS` (padrão 12), `COLLECTION_SCHEDULER_ENABLED`
- `timer.unref()` — não bloqueia shutdown

**Scheduler de IA** (`src/ai/ai-daily-scheduler.js`)
- Enfileira lote de docs pendentes a cada 12h (padrão 15 por ciclo = 30 docs/dia)
- Prioridade: ano corrente → anterior → mais recentes primeiro
- Configurável: `AI_SCHEDULER_DOCS_PER_CYCLE`, `AI_SCHEDULER_INTERVAL_MS`

**Infraestrutura de schedulers**
- `GET /api/scheduler/status` — status em tempo real de ambos os schedulers
- Painel `/admin/coletas` com seção de schedulers

### Integração PNCP v3

**`src/integracoes/pncp-orgaos.js`** — Novo módulo
- Consulta direta por CNPJ via `/pncp-api/v1/orgaos/{cnpj}/compras`
- `listarComprasPorCnpj`, `listarItensCompra`, `buscarResultadosItem`, `listarContratosPorCnpj`
- `parsePncpNumeroControle`, `extrairVencedorResultados`

**`scripts/pncp-sincronizar.js`** — Novo script
- Busca compras por CNPJ, localiza documentos locais por `numero_pncp`, atualiza vencedor + valor
- Opções: `--ano=YYYY`, `--cnpj=X`, `--dry-run`, `--max=N`, `--verbose`
- `npm run pncp:sincronizar`, `pncp:sincronizar:prefeitura`, `pncp:sincronizar:camara`

**`src/db/index.js`** — novas funções
- `getDocumentoByNumeroPncp(numeroPncp)` — lookup por `licitacoes_detalhes.numero_pncp`
- `upsertDadosPncp(documentoId, dados)` — atualiza vencedor/valor com `origem='pncp_orgaos'`

### Documentação e repositório
- README atualizado para v0.7 com estado atual, todos os scripts e limitações
- DEVELOPMENT_PLAN compactado (histórico v0.1–v0.7 consolidado, roadmap v0.8+)
- `.env.example` com variáveis de schedulers e PNCP adicionadas
- `.gitignore` atualizado (`.claude/`, `.agents/`, `.gemini/`, `.qodo/`, `skills-lock.json`)
- Arquivos obsoletos removidos: `ARCHITECTURE_REFACTOR_PLAN.md`, `IMPLEMENTACAO_*.md`, `SPEC_*.md`, `redesign/`
- Repositório publicado no GitHub: https://github.com/henriqueogs/monitor_ritapolis

---

## Estado da base (referência rápida)

| Camada | Estado |
|---|---|
| Coleta Prefeitura | ✅ 532 docs, última em 2026-05-15 |
| Coleta Câmara | ✅ 13 docs, última em 2026-05-13 |
| Resumos IA — 2026 | ✅ 25/25 editais com status ok |
| Leitura integrada — 2026 | ✅ 26/26 licitações com grupo |
| Produtos estruturados | ✅ 219 produtos, 217 com preço/fornecedor |
| Vencedores identificados | ✅ 14 licitações, R$ 1,66M |
| Fornecedores consolidados | ✅ 25 CNPJs únicos |
| Categorização | ✅ 495 licitações, 7 categorias |
| Resumos IA — anos anteriores | ⚠️ ~380 pendentes (scheduler processa 30/dia) |
| PNCP v3 sincronizado | ⏳ Não executado ainda — rodar `pncp:sincronizar` |
| Autenticação `/admin` | ❌ Pendente v0.8 |
| Deploy cloud | ❌ Pendente v0.8 |

---

## Comandos rápidos

```bash
npm start                                          # API 3001 + frontend 3000
npm run ai:status -- --ano=2026                    # cobertura IA
npm run pncp:sincronizar -- --dry-run --ano=2026   # testar sync PNCP
npm run inteligencia:auditar                       # reauditoria
npm run build --prefix frontend                    # build produção
```

---

## Regras de trabalho

- `DEVELOPMENT_PLAN.md` — roadmap e histórico de versões
- `CURRENT_WORK.md` — foco imediato, manter enxuto
- Arquivos temporários (logs, screenshots, checklists) devem ser deletados após o uso
- O frontend consome apenas a API própria
- A fonte oficial sempre tem prioridade sobre o resumo de IA
- Mock nunca aparece em produção
