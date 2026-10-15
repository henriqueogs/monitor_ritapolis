# Spikes S1 e S2 — `sqlite-vec` e custo de indexação (Fase 0 do plano de IA)

Data: 15/10/2026 · Decide o [ADR 0002](../adr/0002-vector-store-sqlite-vec.md) · Plano: [PLANO_IA_RAG.md](../PLANO_IA_RAG.md)

## S1 — `sqlite-vec` carrega em `node:sqlite` e aguenta o volume?

**Método.** Banco em memória, vetores aleatórios normalizados de 1024 dimensões (`baai/bge-m3`),
tabela `vec0` + tabela de metadados. Script versionado: [`scripts/spikes/sqlite-vec-spike.js`](../../scripts/spikes/sqlite-vec-spike.js)
(`npm install --no-save sqlite-vec@0.1.9`; `N=66000 node --no-warnings scripts/spikes/sqlite-vec-spike.js`).

**Resultado — Windows x64 (dev), Node 24.14, sqlite-vec 0.1.9:**

| Chunks | Inserção | KNN exato (k=10) | KNN + filtro ano/tipo (JOIN) | Busca exata em JS (fallback) |
|---:|---:|---:|---:|---:|
| 2.000 | 55 ms | 3 ms | 5 ms | 3 ms |
| 20.000 | 571 ms | 21 ms | 25 ms | 22 ms (+321 ms para carregar) |
| 66.000 | 1,6 s | 60 ms | 69 ms | 1,1 s (carregando do SQLite) |
| 100.000 | 2,7 s | 88 ms | 100 ms | 120 ms (+1,7 s para carregar) |

- `new DatabaseSync(':memory:', { allowExtension: true })` e `loadExtension(getLoadablePath())` funcionam; `vec_version()` = `v0.1.9`.
- O vizinho mais próximo do próprio vetor volta com distância 0, e a busca em JS concorda com a do `vec0` em todos os tamanhos.
- Filtros por metadados funcionam por **pós-filtro** (KNN com `k` maior + `JOIN` na tabela comum). Com filtro muito seletivo é preciso aumentar o `k` do KNN (aqui 200).
- O pacote tem binários para `linux-x64` e `linux-arm64` (e macOS/Windows) como dependências opcionais.

**Não provado ainda (bloqueia aceitar o ADR):** a **VM de produção (Linux ARM, Oracle)**. Rodar o script lá é o critério de aceite do S1.
Se `allowExtension`/`loadExtension` falhar ou o `.so` não carregar, vale o fallback do ADR: busca exata em JS atrás da mesma porta `VectorStore`
(1,1 s a 66 mil chunks carregando do SQLite; **sem** manter tudo em memória — a VM tem ~260 MB livres, e os vetores float32 ocupam ~258 MB).

## S2 — Volume e custo de indexação

Medido no banco local (cópia de 02/10; 340 MB), texto extraído por `texto_completo` de documentos e anexos:

| Fonte | Itens | Caracteres |
|---|---:|---:|
| Editais/extratos (`documentos`) | 531 | 14,4 M |
| Anexos de editais (`documentos_anexos`) | 1.753 | 71,5 M |
| **Total da Fase 1 (licitações)** | | **85,8 M** |
| Todo o acervo com texto | | 88,9 M |

A Fase 1 já cobre ~97% do texto do acervo (o resto é pouco).

Estimativa com chunks de 1.500 caracteres e sobreposição de 200:

| Item | Valor |
|---|---:|
| Chunks | **~66 mil** |
| Tokens a embedar | **~24,5 M** (≈ 3,5 caracteres/token) |
| Chamadas de embedding (lotes de 32) | **~2.060** |
| Armazenamento float32 | **~258 MB** (+76% sobre o banco atual) |
| Armazenamento int8 (quantizado) | ~64 MB |
| KNN exato a esse volume | ~60 ms |

Limites do provedor (medidos em 06/10 para o modelo de chat; o de embedding não foi medido): 429 a partir de ~116 req/min.
A 30 req/min seriam ~70 min de indexação inicial; a campanha de resumos já usa 1–3 req/min, então há folga — **mas o limite do endpoint de embedding precisa ser medido** antes (S2 não cobre isso).

## Conclusões e recomendações

1. **Seguir com `sqlite-vec`** atrás da porta `VectorStore`, condicionado a rodar o spike na VM ARM.
2. **Quantização.** Os vetores float32 elevam o banco em ~76% e o snapshot diário para o R2 (guard de operações classe A/B). Avaliar `int8` (4× menor) ou indexar só licitações recentes na primeira versão; medir a perda de recall no eval harness antes de decidir.
3. **Indexação incremental** por hash do chunk, em janela ociosa, com orçamento separado da campanha de resumos.
4. **Custo em reais** não foi estimado: depende do plano/crédito do NVIDIA NIM para `bge-m3`. Confirmar antes da indexação inicial (24,5 M tokens).
5. Itens que o spike **não** responde: recall real de `bge-m3` em português jurídico/licitatório (vai para o eval harness) e o limite de taxa do endpoint de embedding.
