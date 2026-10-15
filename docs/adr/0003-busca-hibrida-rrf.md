# ADR 0003 — Recuperação híbrida FTS5 + vetor com fusão RRF

**Status:** proposto

## Contexto
Só vetor erra identificadores exatos (nº de processo, CNPJ, nome de empresa). Só FTS5 erra
sinônimos e paráfrases. O FTS5 (`documentos_fts`, `despesas_fts`) já existe.

## Decisão
Executar BM25 (FTS5) e busca vetorial em paralelo e fundir por Reciprocal Rank Fusion
(`score = Σ 1/(60 + rank)`). Filtros de metadados (ano, tipo, fonte) aplicados nos dois ramos.
Rerank por LLM é opcional e só entra se o eval mostrar ganho mensurável.

## Consequências
+ Robusto a ambos os tipos de consulta, sem pesos para calibrar. Reaproveita FTS existente.
− Duas consultas por pergunta; aceitável no volume atual.
