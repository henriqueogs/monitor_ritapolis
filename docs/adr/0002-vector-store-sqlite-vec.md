# ADR 0002 — Índice vetorial em `sqlite-vec` atrás da porta `VectorStore`

**Status:** proposto (depende do spike S1 da Fase 0)

## Contexto
Produção é um único SQLite numa VM Oracle (Linux x86_64, 954 MB de RAM, Always Free), com backup/snapshot para R2.
Subir um banco vetorial separado aumenta custo e superfície operacional.

## Decisão
Guardar chunks e vetores no mesmo SQLite via extensão `sqlite-vec`, atrás da porta
`VectorStore { upsert(chunks), search({vetor, k, filtros}), deleteByDoc(docId) }`.
Fallback se a extensão não carregar em `node:sqlite`: busca exata em JS (cosseno sobre
Float32Array) — aceitável até ~100k chunks. Multi-tenant futuro: implementação pgvector
da mesma porta.

## Evidência dos spikes (15/10/2026)
Ver [S1/S2](../spikes/S1-S2-sqlite-vec.md). Em Windows x64: `sqlite-vec` 0.1.9 carrega em `node:sqlite`
(`allowExtension`), KNN exato de ~60 ms a 66 mil chunks de 1024 dimensões; a busca exata em JS atende o
fallback em JS (~1,1 s a 66 mil chunks). **Provado também na VM de produção (Linux x86_64)**: carrega e o KNN a 10 mil chunks leva
97 ms; o fallback em JS não serve lá (1,9 s a 10 mil). O modelo de embedding mudou (`baai/bge-m3` está morto, 410):
`nvidia/nemotron-3-embed-1b`, **2048 dimensões** → ~66 mil chunks = ~540 MB em float32, ~135 MB em int8. Com ~253 MB de RAM livre na VM,
**int8 (ou bit + rerank) e pré-filtro lexical são requisitos**, não otimizações. Recomendado aceitar com essas condições.

## Consequências
+ Zero infra nova; backup existente cobre o índice; filtros por metadados via SQL.
− `node:sqlite` é experimental e precisa de `allowExtension`; validar no spike S1
  (Windows dev e Linux x86_64 prod — feito). Reembedar o acervo consome cota NVIDIA — indexação incremental,
  com orçamento próprio (reaproveitar o guard da campanha histórica).
