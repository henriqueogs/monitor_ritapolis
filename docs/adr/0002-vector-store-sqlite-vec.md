# ADR 0002 — Índice vetorial em `sqlite-vec` atrás da porta `VectorStore`

**Status:** proposto (depende do spike S1 da Fase 0)

## Contexto
Produção é um único SQLite numa VM Oracle (ARM, Always Free), com backup/snapshot para R2.
Subir um banco vetorial separado aumenta custo e superfície operacional.

## Decisão
Guardar chunks e vetores no mesmo SQLite via extensão `sqlite-vec`, atrás da porta
`VectorStore { upsert(chunks), search({vetor, k, filtros}), deleteByDoc(docId) }`.
Fallback se a extensão não carregar em `node:sqlite`/ARM: busca exata em JS (cosseno sobre
Float32Array) — aceitável até ~100k chunks. Multi-tenant futuro: implementação pgvector
da mesma porta.

## Consequências
+ Zero infra nova; backup existente cobre o índice; filtros por metadados via SQL.
− `node:sqlite` é experimental e precisa de `allowExtension`; validar no spike S1
  (Windows dev, Linux ARM prod). Reembedar o acervo consome cota NVIDIA — indexação incremental,
  com orçamento próprio (reaproveitar o guard da campanha histórica).
