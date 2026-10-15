# Plano — Camada de IA analítica (RAG + ferramentas) e núcleo agnóstico de município

**Objetivo:** perguntas em linguagem natural sobre os dados do município, com resposta
fundamentada e citada, em arquitetura reaproveitável por outras cidades.
**Decisões:** ver [`docs/adr/`](adr/README.md). **Regras de produto:** CLAUDE.md §11
(período em valores, origem visível, "recente" = publicação).

## Arquitetura alvo

```
Pergunta ─► Guardrails ─► Agente (tool-use, N passos máx.) ─► Verificador ─► Resposta + citações
                              │
        ┌─────────────────────┼────────────────────────┐
  Busca híbrida (ADR 3)   Ferramentas tipadas (ADR 4)   Fatos/alertas já extraídos
  FTS5 + vetor + RRF      só leitura, período obrigatório
        │
  VectorStore (ADR 2) ◄── Indexador incremental ◄── documentos / anexos / resumos
```

Portas (`src/ai/ports/`): `LLMProvider`, `EmbeddingProvider`, `VectorStore`.
Já existe: `NvidiaProvider.embed()` e `generateJson()` — serão adaptados às portas, sem reescrever.

## Princípios de isolamento (trabalho paralelo no repositório)

Há vários worktrees ativos (OCR, orçamento histórico, JSON de IA, SEO, firewall…). Para não colidir:
1. **Só adicionar:** código novo em `src/ai/ports/`, `src/ai/rag/`, `tests/evals/`. Não editar `src/ai/providers/`, `src/pipeline/`, `src/db/index.js`; em `server.js`, no máximo o registro da rota.
2. **Composição, não edição:** `LLMProvider` envolve o `NvidiaProvider` atual sem modificá-lo.
3. **Tabelas novas** em migração própria; nenhuma tabela existente alterada.
4. **Flag desligada por padrão**; indexador fora do scheduler até aprovação.
5. **Orçamento de IA separado** do da campanha histórica; roda em janela ociosa.
6. **Docs sem colisão:** `CURRENT_WORK.md` só aponta para este plano.
7. **PRs pequenos e independentes**; Fase 3 (move código existente) só após merge dos trabalhos em andamento.

## Fiscais (processo contínuo)

Os agentes `fiscal-datas`, `fiscal-valores`, `fiscal-proveniencia` e `fiscal-privacidade` (CLAUDE.md §12)
rodam em todo PR que exiba dados. Na IA, o `fiscal-valores` exige que números venham de ferramentas
tipadas (ADR 0004) e o `fiscal-proveniencia` valida as citações (ADR 0005). Os casos de fronteira
de mandato e de dupla contagem entram no dataset ouro (ADR 0006).

## Fase 0 — Fundações (sem feature visível)

- [ ] ADRs 0001–0006 revisados e aceitos
- [x] **Spike S1:** `sqlite-vec` carrega em `node:sqlite` no Windows (dev) e na **VM de produção (Linux x86_64, não ARM)** ✅. Resultado em [`docs/spikes/S1-S2-sqlite-vec.md`](spikes/S1-S2-sqlite-vec.md)
- [x] **Spike S2:** ~66 mil chunks, ~26 M tokens; `baai/bge-m3` está morto (410) → `nvidia/nemotron-3-embed-1b` (2048 dim); sem 429 até 3 em paralelo (~1.800–4.300 chunks/min). **Pendente**: preço/crédito do modelo e quantização (int8) para caber na RAM da VM
- [x] Portas `LLMProvider` / `EmbeddingProvider` / `VectorStore` + **testes de contrato** reutilizáveis (`src/ai/ports/`, contratos em `src/ai/ports/contracts/*.contract.js`). Inclui erros tipados (`ModeloIndisponivelError` detecta modelo morto como o `bge-m3`, `ProviderLimiteError`, `DimensaoInesperadaError`), `verificarModelo()` e o adaptador NVIDIA de embeddings (lotes de 128, `input_type`/`truncate`). O `generateJson` atual devolve **texto**: `llm-provider-compat` cumpre a porta e centraliza a extração de JSON (hoje copiada em 6 módulos)
- [x] `VectorStore` em memória (float32 e **int8**, ~4× menos espaço; recall@1 ≥ 95% contra o exato) — referência para o adaptador `sqlite-vec` da Fase 1
- [~] Eval harness: recuperação offline ✅ (`npm run eval:ia`; `tests/evals/` com dataset ouro de 5 perguntas e gate no CI; métricas de citação e recusa prontas em `src/ai/eval/metricas.js`). **Pendente:** runner de geração (groundedness, citações, recusa com LLM) e dataset real de 30–50 perguntas
- [ ] Mapa "genérico vs. Ritápolis" (inventário de constantes/CNPJs/domínios no código) — insumo da Fase 3

**Pronto quando:** testes de contrato verdes contra fake e contra provider real; spikes S1/S2 documentados com decisão; harness roda com dataset de 5 perguntas.

## Fase 1 — Fatia vertical: RAG sobre licitações/editais

- [ ] Esquema: `ai_chunks` (id, doc_id, anexo_id, ordem, texto, hash, ano, tipo, fonte, url_origem) + tabela vetorial
- [ ] Chunker estrutural (reaproveita `chunk-text.js`, respeita seções/itens; hash para idempotência)
- [ ] Indexador incremental (job na fila existente, orçamento próprio, retomável) — só reembeda o que mudou
- [ ] Recuperador híbrido (FTS5 + vetor + RRF) com filtros de metadados
- [ ] Serviço `perguntar()`: recupera → monta contexto delimitado → LLM com saída estruturada → verificador → citações
- [ ] Rota `POST /api/ia/perguntar` fina (sem lógica), rate limit, teto de tokens, kill-switch
- [ ] Prompt versionado em `src/ai/prompts/` + log de trace (recuperados, tokens, latência)
- [ ] Dataset ouro com 30–50 perguntas reais sobre licitações
- [ ] UI mínima (campo de pergunta, resposta, citações clicáveis para `url_origem`)

**Pronto quando:** recall@5 ≥ 0,8 no dataset; fidelidade ≥ 0,9; 100% das respostas com citação válida; perguntas sem evidência são recusadas; custo médio por pergunta medido e dentro do teto.

## Fase 2 — Ferramentas analíticas (empenhos, credores, alertas)

- [ ] Catálogo de ferramentas tipadas e testadas (período obrigatório onde soma valor)
- [ ] Agente com tool-use, limite de passos, validação de parâmetros contra JSON Schema
- [ ] Estender dataset ouro com perguntas numéricas (verificadas contra SQL de referência)
- [ ] Integrar fatos/alertas existentes como fonte recuperável

**Pronto quando:** respostas numéricas batem 100% com SQL de referência; nenhuma soma sem intervalo.

## Fase 3 — Núcleo agnóstico (ports & adapters)

- [ ] Contrato `Coletor` + modelo canônico (Documento, Licitação, Empenho, Credor)
- [ ] `municipio.config` (CNPJs, domínios, fontes, regras editoriais, textos)
- [ ] Mover o específico de Ritápolis para `adapters/ritapolis`
- [ ] Monorepo/pacotes: `core`, `ai`, `adapters/*`, `api`, `web`
- [ ] Testes de contrato dos coletores

## Fase 4 — Multi-tenant e referência pública

- [ ] Postgres + pgvector (implementação da mesma porta), isolamento por município
- [ ] OpenAPI, guia "adicionar uma cidade", licença, política de dados/LGPD (folha e dados pessoais)

## Riscos

| Risco | Mitigação |
|---|---|
| `sqlite-vec` não carrega em `node:sqlite` (experimental) | Spike S1 provado em dev e na VM (x86_64); fallback em JS não serve na VM (RAM/CPU) |
| VM com 954 MB de RAM (~253 MB livres) não comporta 540 MB de vetores float32 | int8/bit + rerank, pré-filtro lexical (FTS5), indexar só o necessário; medir no eval harness |
| Modelo de embedding aposentado pelo provedor (`bge-m3` → 410) | `NVIDIA_EMBED_MODEL` configurável; porta `EmbeddingProvider` + teste de contrato que detecta modelo morto |
| Cota NVIDIA já pressionada pela campanha histórica | Spike S2; orçamento separado; indexação incremental e em horário ocioso |
| Prompt injection via documentos coletados | Dados delimitados, sem ferramentas de escrita, verificador (ADR 5) |
| Alucinação / resposta sem fonte | Citação obrigatória + recusa; eval como gate (ADR 5, 6) |
| Abstração prematura | Core só na Fase 3, guiado por caso real |
| LGPD (folha, credores PF) | Excluir/anonimizar PF do índice por padrão; revisar na Fase 4 |
