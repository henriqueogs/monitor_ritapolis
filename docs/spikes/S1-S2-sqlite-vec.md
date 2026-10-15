# Spikes S1 e S2 — `sqlite-vec` e embeddings (Fase 0 do plano de IA)

Data: 15/10/2026 · Decide o [ADR 0002](../adr/0002-vector-store-sqlite-vec.md) · Plano: [PLANO_IA_RAG.md](../PLANO_IA_RAG.md)

**Resumo.** O `sqlite-vec` funciona na VM de produção (que é **x86_64, não ARM**, com só **954 MB de RAM**).
O modelo de embedding do plano (`baai/bge-m3`) está **morto na NVIDIA (410 Gone)**; o substituto testado é
`nvidia/nemotron-3-embed-1b`, que tem **2048 dimensões** e dobra o armazenamento. O gargalo real da VM é **memória**, não o provedor.

## S1 — `sqlite-vec` carrega em `node:sqlite` e aguenta o volume?

Script: [`scripts/spikes/sqlite-vec-spike.js`](../../scripts/spikes/sqlite-vec-spike.js) (banco em memória, vetores aleatórios, `npm install --no-save sqlite-vec@0.1.9`).

| Ambiente | Chunks (1024 dim) | Inserção | KNN exato (k=10) | Busca exata em JS |
|---|---:|---:|---:|---:|
| Windows x64 (dev) | 20.000 | 571 ms | 21 ms | 22 ms (+321 ms para carregar) |
| Windows x64 (dev) | 66.000 | 1,6 s | 60 ms | 1,1 s (carregando do SQLite) |
| Windows x64 (dev) | 100.000 | 2,7 s | 88 ms | 120 ms (+1,7 s) |
| **VM de produção** (Linux x64, Node 24.20) | 10.000 | 2,7 s | **97 ms** | 1,9 s |

- `allowExtension` + `loadExtension` funcionam nos dois; `vec_version()` = `v0.1.9`; o vizinho do próprio vetor volta com distância 0 e a busca em JS concorda com a do `vec0`.
- Filtros por metadados funcionam por pós-filtro (KNN com `k` maior + `JOIN`).
- **A VM é Ubuntu 24.04 x86_64** (o plano e o ADR diziam ARM): 954 MB de RAM, ~253 MB disponíveis com a API no ar, 2 vCPU, 32 GB de disco livres. A VM é ~5× mais lenta que o dev por vetor.
- O spike na VM rodou numa pasta temporária (removida), com `nice` e 10 mil chunks para não pressionar a memória do serviço.

**Conclusão S1:** o `sqlite-vec` é viável. O **fallback em JS não serve na VM** (1,9 s a 10 mil chunks → ~12 s a 66 mil).

## S2 — Volume, modelo e taxa de embedding

### Modelo: `baai/bge-m3` não existe mais
Qualquer chamada a `baai/bge-m3` devolve **410 Gone** (modelo aposentado). Isso também derruba o `scripts/agrupar-produtos-embeddings.js`.
Modelos de embedding listados pela conta hoje: `nvidia/nemotron-3-embed-1b`, `nvidia/embed-qa-4`, `nvidia/llama-3.2-nv-embedqa-1b-v1`, `nvidia/llama-3.2-nemoretriever-1b-vlm-embed-v1`, `nvidia/llama-nemotron-embed-vl-1b-v2`, `nvidia/nv-embedqa-mistral-7b-v2`, `snowflake/arctic-embed-l`.
Dos testados, só **`nvidia/nemotron-3-embed-1b`** respondeu (os outros três deram 404, sem acesso na conta).

| Teste (`nvidia/nemotron-3-embed-1b`) | Resultado |
|---|---|
| Dimensões | **2048** (o parâmetro `dimensions` é rejeitado: 400) |
| `input_type` (`query`/`passage`) e `truncate` | aceitos; funciona também sem eles |
| Sanidade em português (consulta "quem venceu o pregão da merenda?") | relevante 0,65 · irrelevantes 0,03 e 0,11 |
| Texto de ~6.000 caracteres | aceito (1.804 tokens → ~3,3 caracteres/token) |

### Taxa (sonda gentil: ~970 chunks sintéticos de 1.500 caracteres, sem retry)
Script: [`scripts/spikes/nvidia-embed-probe.js`](../../scripts/spikes/nvidia-embed-probe.js). **Nenhum 429.**

| Cenário | Latência por chamada | Vazão |
|---|---:|---:|
| Lote de 1 / 8 / 32 / 64 / 128 chunks | 0,5 / 0,4 / 1,0 / 1,8 / 2,8 s | lote máximo testado: 128 (aceito) |
| Sequencial, lotes de 32 | ~1,1 s | ~1.800 chunks/min |
| 2 em paralelo | ~1,2 s | ~2.800 chunks/min |
| 3 em paralelo | ~1,2 s | ~4.300 chunks/min |

A resposta não expõe cabeçalhos de rate limit. O teto real não foi encontrado (parei de propósito por 3 em paralelo; a conta já rate-limitou o endpoint de chat com 2 simultâneas, e a chave é compartilhada com a campanha de resumos).
**Preço/crédito do modelo na NVIDIA: não verificado.**

### Volume do acervo (banco local, cópia de 02/10; 340 MB)
Editais/extratos 14,4 M caracteres + anexos de editais 71,5 M = **85,8 M** (a Fase 1 já cobre ~97% do texto do acervo).
Com chunks de 1.500 caracteres e sobreposição de 200:

| Item | float32 (2048 dim) | int8 | bit |
|---|---:|---:|---:|
| Chunks | **~66 mil** | idem | idem |
| Tokens a embedar | **~26 M** (~3,3 car./token) | | |
| Chamadas de embedding (lotes de 128) | **~520** | | |
| Armazenamento dos vetores | **~540 MB** | ~135 MB | ~17 MB |
| Tempo de indexação inicial (1.800–2.800 chunks/min) | **~25–37 min** | | |
| KNN exato na VM (extrapolado de 97 ms a 10 mil × 1024) | ~1,3 s | | |

## Conclusões e recomendações
1. **Seguir com `sqlite-vec`** atrás da porta `VectorStore` (S1 satisfeito). Recomendo aceitar o ADR 0002 com as ressalvas abaixo.
2. **A memória da VM manda.** Com ~253 MB livres, 540 MB de vetores float32 não cabem no cache de páginas (cada consulta leria disco) e o snapshot diário do R2 cresceria ~160%. Usar **int8** (~135 MB) ou **bit + rerank** é praticamente obrigatório; medir a perda de recall no eval harness.
3. **Não varrer tudo a cada pergunta.** Desenho recomendado: **pré-filtro lexical** (FTS5/BM25 já existente → ~500 candidatos) e distância vetorial exata só nesses candidatos (`vec_distance_cosine`), em vez de KNN sobre 66 mil vetores (~1,3 s). Entra no ADR 0003.
4. **Trocar o modelo de embedding** em `NVIDIA_EMBED_MODEL` (o default do `config.js` passa a ser `nvidia/nemotron-3-embed-1b`) e **conferir o `.env` da VM**, que pode ainda apontar para `baai/bge-m3`. O limiar de 0,88 do `agrupar-produtos-embeddings` foi calibrado para o modelo antigo: reavaliar.
5. **Indexação inicial**: concorrência ≤ 2, lotes de 64–128, janela ociosa, com recuo em 429, para não competir com a campanha de resumos (mesma chave).
6. **Ainda não respondido:** preço/crédito do modelo; limite de taxa acima de 3 em paralelo; recall real do `nemotron-3-embed-1b` em texto licitatório (eval harness); latência real de KNN com int8 na VM.
