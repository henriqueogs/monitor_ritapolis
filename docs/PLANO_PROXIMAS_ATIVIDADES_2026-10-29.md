# Plano das próximas atividades — 29/10/2026

Decisões do mantenedor (29/10):

- PR #209 (A11) mergeado.
- **Pergunta à IA (`/perguntar`, `AI_ASK_ENABLED`) fica estacionada.** Ainda não
  analisamos o conteúdo todo e o uso interno de IA já tem limite; abrir para
  terceiros está longe. Nada de indexar, ligar rota ou montar dataset agora.
- **Na Lupa será refatorada** para um panorama amplo de inconsistências e gastos,
  em várias vertentes — não só o que o mantenedor listou. Referência de
  qualidade: a Descoberta #57 (supressão de árvores, feita à mão).

## Ordem

| # | Atividade | Depende de | Entrega |
|---|---|---|---|
| 1 | ✅ Merge do #209 | — | feito |
| 2 | Medir A11 na VM | deploy do #209 | números antes/depois |
| 3 | Resumos de IA (A3, A4, A6, A5, A8) | 2 (VM menos sufocada) | cobertura de texto/resumo completa |
| 4 | ~~Pergunta à IA~~ | — | **estacionada** |
| 5 | **Na Lupa v4** (abaixo) | 3 parcial (fatos precisam de resumo/texto) | vertentes publicando |
| 6 | Backlog (OCR, Fase 3, deep-links, transparência) | — | oportunista |

## 2. Medir A11 (após deploy)

Antes (29/10): `scripts/api.js` leu 77 GB em ~3,7 h; iowait 30–48%; steal 46–61%
em picos; `facts` 1073 execuções/24 h.

1. `read_bytes` do `api.js` em 10 min (`/proc/<pid>/io`) e `vmstat 1 30`.
2. `/api/saude/pipeline`: `docs_24h` segue 200? `consumo_24h` por tarefa.
3. Se o iowait seguir > 20%: próximo alvo é o `SELECT *` do plano global
   (colunas necessárias, ou índice por `url_pdf`) e o `DISTINCT` de resumos ok.
4. Registrar o resultado em `CURRENT_WORK.md` (A11).

Aceite: `read_bytes` ≥ 5× menor, `docs_24h` mantido.

## 3. Resumos de IA

Ordem: A3 (`limite_tamanho` → chunking/map-reduce) → A4 (`contrato_rejeitado`) →
A6 (alerta `campanha_abaixo_da_meta`) → A5 (fila de 10 em revisão + SLA) → A8
(`source-check` 893 e `facts` 200 drenam?). Cada um com TDD, um PR por item.
Meta: nenhum documento com texto sem resumo; fatos extraídos de tudo — **é a
matéria-prima da Na Lupa v4**.

## 5. Na Lupa v4 — panorama de inconsistências e gastos

### 5.1 Princípios (herdados da #57 e do `planejamento-descobertas-investigativas.md`)

1. Uma descoberta = uma afirmação, objeto delimitado, cálculo reproduzível.
2. **Quem acha o fato é regra determinística; a IA só narra** (e, no modo
   exploratório, propõe hipóteses que o sistema verifica por consulta).
3. Toda afirmação cita fonte oficial rastreável (CLAUDE.md §11.3) e período
   explícito (§11.1). Linguagem não acusatória: fato + fonte + critério.
4. Publicação automática só depois dos gates (factual → editorial); dúvida vai
   para revisão. Fiscais `datas`, `valores`, `proveniencia`, `privacidade`
   obrigatórios em cada vertente.

### 5.2 O que já existe (reaproveitar, não refazer)

`src/alertas/` (3,3 mil LOC): detectores `anomalia-temporal`, `gasto-atipico-categoria`,
`empenhado-acima-contratado`, `repeticao-tematica`, `valor-relevante`,
`risco-alto`, `questionamentos`, `fatos-agregados`; gates (`gate-deterministico`,
`discovery-quality`), revalidação, estado editorial + histórico. Base de fatos:
`inteligencia_fatos` (tipo, quantidade, unidade, valor, datas, ator, trecho_fonte).
Problema conhecido: a maioria do acervo legado são agregações genéricas por
categoria/ano; só a #57 é útil, e só 1 descoberta pública.

### 5.3 Arquitetura alvo

- **Contrato de vertente** (`src/alertas/vertentes/<nome>.js`): função pura
  `detectar(contexto) → candidatos[{ objeto, metrica, evidencias[], periodo, severidade }]`
  + metadados (nome, versão, critério em linguagem simples). Uma vertente nova =
  um arquivo + testes; o orquestrador roda todas, aplica os gates e persiste.
- **Catálogo e medição por vertente**: candidatos / publicados / rejeitados na
  revisão (precisão). Vertente com precisão baixa é rebaixada para `revisao`.
- **Modo exploratório (IA propõe, regra verifica)**: a IA recebe resumos e tabelas
  de fatos e sugere *tipos de inconsistência* e consultas; cada sugestão só vira
  candidato se uma verificação determinística reproduz o achado com evidência.
  Sugestões úteis recorrentes viram vertente fixa. Respeita o teto de uso de IA.
- Legado: ocultar o que não passa no gate novo, preservar para auditoria.

### 5.4 Vertentes (primeiras; lista aberta)

**Gastos e compras** (dados: empenhos, licitações, atas, PNCP, diárias)
1. Compras repetidas do mesmo objeto/fornecedor em janela curta (fracionamento,
   soma acima do limite de dispensa) — normalização de objeto + unidade.
2. Preço acima da referência: item vs. atas/PNCP/histórico próprio, só com
   unidade equivalente.
3. Diárias: valor por servidor/destino/período do mandato, concentração,
   diárias sem finalidade/documento (separar show/som — `finalidade-v3`).
4. Maiores gastos por categoria/credor com salto anual e concentração
   (já há `gasto-atipico-categoria`; migrar ao contrato novo).
5. Empenhado > contratado; pagamento após fim da vigência; aditivos acima de
   limite — a partir de contratos e atas.

**Inconsistências documentais** (dados: documentos, anexos, fatos)
6. Quantidade/valor divergente entre documentos do mesmo processo (edital ×
   ata × contrato × empenho × PNCP) — é o método da #57 generalizado.
7. Datas incoerentes (assinatura antes do edital, publicação fora do prazo,
   vigência invertida) e número de processo divergente.
8. Objeto do empenho incompatível com o do contrato/licitação.

**Legislação** (dados: leis, decretos, portarias, projetos da Câmara)
9. Norma que cita lei/artigo revogado ou inexistente no acervo; numeração
   duplicada ou com lacuna; decreto que regulamenta lei não localizada.
10. Projeto aprovado na Câmara sem lei publicada correspondente (e o inverso).
11. Créditos suplementares/ajustes contra o limite da LOA.

**Pessoal (cuidado LGPD — só agregado)**
12. Folha: variações por secretaria/mandato; nada nominal sem base legal.

> A lista é ponto de partida: cada rodada de resumos (atividade 3) pode revelar
> padrões novos; o modo exploratório existe justamente para não depender só do
> que já pensamos.

### 5.5 Fases

| Fase | Entrega | Aceite |
|---|---|---|
| N0 | Diagnóstico: auditar descobertas atuais, amostrar 30 achados reais (da base de fatos) por vertente e medir quantos são verificáveis | relatório + vertentes priorizadas pelo mantenedor |
| N1 | Contrato de vertente + orquestrador + migração de 2 detectores existentes + oculta legado | testes verdes; nenhuma descoberta pública fora do gate |
| N2 | Vertentes 6 e 1 (as de maior valor e mais próximas da #57) | ≥ 3 descobertas publicáveis com revisão humana |
| N3 | Vertentes 2, 3, 5, 7, 9 | precisão medida por vertente |
| N4 | Modo exploratório (IA propõe → regra verifica) com teto de tokens | ≥ 1 vertente nova nascida do modo |
| N5 | Religar `DESCOBERTAS_SCHEDULER_ENABLED` só com precisão ≥ meta | decisão do mantenedor |

N0 começa já (não depende dos resumos completos: usa o que existe). N2+ rendem
mais conforme a atividade 3 avança.

## 6. Backlog (oportunista)

OCR Câmara/Prefeitura (53 imagens + indicações/resoluções/requerimentos — alimenta
a atividade 3), Fase 3 núcleo agnóstico (textos de página via ente, contrato
`Coletor`), deep-links fora de datacenter, transparência (fonte de recurso,
emendas×empenhos, `coTce`).

## Decisões abertas para o mantenedor

1. Prioridade entre vertentes 1–12 (sugestão: 6 → 1 → 3 → 9).
2. Meta de precisão para religar o scheduler (sugestão: ≥ 80% aprovadas na
   revisão em lote de 20).
3. Teto diário de tokens do modo exploratório.
