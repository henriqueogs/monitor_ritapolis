# Cobertura de Dados — Monitor Ritápolis

Levantamento da completude da base e da recorrência da coleta.

Atualizado em: 2026-06-15. Base: 547 documentos (516 editais).

> Como atualizar este documento: rode `npm run cobertura:relatorio` (ver §4) e
> cole os números. Os percentuais ao vivo estão em `/inteligencia` → "Cobertura
> dos dados por ano" e em `GET /api/inteligencia/cobertura`.

---

## 1. Visão geral (editais)

| Dimensão | Cobertura | Faltam | O que falta |
|---|---|---|---|
| Texto extraído (status `ok`) | **86%** (446/516) | 70 | 38 sem PDF + 32 PDF-imagem (OCR) |
| Resumo IA (contrato 1.x) | **89%** (458/516) | 58 | 16 prontos p/ scheduler · 42 sem texto |
| Análise integrada (2.0) | **32%** (165/516) | 351 | **274 elegíveis** 2017–2022 (lote não rodado) |
| Vencedor identificado | **82%** (422/516) | 94 | resultado não publicado ou em PDF-imagem |
| Valor final | **44%** (225/516) | 291 | valor ausente na fonte / em ata escaneada |

**Leitura:** o acervo, o texto e o resumo estão maduros (86–89%). As duas maiores
alavancas para chegar perto de 100% são **(a) rodar a análise integrada nos anos
2017–2022** (salto de 32% → ~85%) e **(b) OCR das atas escaneadas** (destrava
vencedor/valor dos anos antigos).

---

## 2. Cobertura por ano (editais)

| Ano | Editais | Vencedor | Valor | Resumo | Análise |
|----:|----:|----:|----:|----:|----:|
| 2026 | 35 | 97% | 86% | 100% | 71% |
| 2025 | 68 | 87% | 69% | 91% | 71% |
| 2024 | 46 | 93% | 83% | 96% | 78% |
| 2023 | 62 | 95% | 58% | 100% | 90% |
| 2022 | 51 | 98% | 53% | 96% | **0%** |
| 2021 | 50 | 92% | 22% | 100% | **0%** |
| 2020 | 65 | 65% | 17% | 72% | **0%** |
| 2019 | 56 | 71% | 21% | 95% | **0%** |
| 2018 | 42 | 76% | 17% | 100% | **0%** |
| 2017 | 35 | 14% | 3% | 54% | **0%** |
| 2016/2013 | 4 | 100% | 0% | ~100% | 0% |

A coluna **Análise = 0%** em 2017–2022 é o item mais visível: a leitura integrada
(contrato 2.0) só foi executada para 2023–2026.

---

## 3. Gaps detalhados e como fechá-los

### 3.1 Análise integrada 2017–2022 — *maior alavanca, recuperável agora*
- **274 editais** têm grupo + texto mas nunca passaram pela leitura integrada.
- Ação: `npm run ai:correlacionar:lote -- --de=2017 --ate=2022` (NVIDIA ligada).
- Estimativa: ~277 chamadas × ~12s ≈ **1h**. Reentrante (cache por hash).
- Efeito: Análise 32% → ~85%.

### 3.2 Resumo IA — 16 editais prontos
- 16 editais com texto `ok` ainda sem resumo 1.x → o **ai-daily-scheduler**
  resolve sozinho (basta a API ligada) ou `npm run ai:resumir`.

### 3.3 OCR de documentos escaneados — *destrava anos antigos*
- **141 anexos** com `status_extracao='requer_ocr'` (atas/homologações imagem).
- **32 editais** com `status_coleta='imagem'` (PDF principal escaneado).
- **13 processos** sem vencedor dependem exclusivamente desse OCR.
- Bloqueado por decisão de ferramenta (Gemini visão precisa de `GEMINI_API_KEY`,
  ausente; ou tesseract local). Fila pronta — ver destaque no CURRENT_WORK.

### 3.4 Documentos sem PDF (`sem_pdf`) — 38 editais
- Concentrados em 2021 (15), 2019 (7), 2017 (4). O link de PDF não foi resolvido
  na coleta. Ação: revisão do parser de anexos da Prefeitura / recoleta dirigida.
- Parte é genuína: alguns processos não têm PDF publicado (lacuna da fonte).

### 3.5 Anexos pendentes não-resultado — 1.132 (baixa prioridade)
- 502 "outro", 476 edital, 131 proposta, 23 recurso. Não geram vencedor/valor
  diretamente; só valem extração onde o documento principal não tem texto
  (`npm run licitacoes:extrair-anexos-sem-texto`).

### 3.6 Valor final — 44%
- Em boa parte é **lacuna da fonte** (ata não traz valor, ou está em imagem).
  Sobe com 3.1 (análise) + 3.3 (OCR). Não é 100% atingível — onde não há valor
  publicado, a plataforma marca "não verificado" (princípio de lacuna explícita).

---

## 4. Recorrência da coleta (cadência automática)

Três schedulers rodam **enquanto a API estiver no ar** (`npm run api`). Cada um
verifica periodicamente e só dispara quando passou do intervalo.

| Scheduler | O que coleta | Intervalo | Checagem | Flag de env |
|---|---|---|---|---|
| **collection-scheduler** | Site Prefeitura + Câmara + PNCP | **12h** | a cada 60min | `COLLECTION_SCHEDULER_*` |
| **daily-scheduler** (transparência) | Empenhos/despesas (Portal SH3) | **24h** | a cada 30min | `DAILY_SCHEDULER_TRANSPARENCIA_INTERVAL_H` |
| **daily-scheduler** (PNCP) | Contratações por CNPJ no PNCP | **168h** (semanal) | a cada 30min | `DAILY_SCHEDULER_PNCP_INTERVAL_H` |
| **ai-daily-scheduler** | Resumo IA de pendentes | **4h** (30 docs/ciclo) | — | `AI_SCHEDULER_*` |

- Ritmo da IA: 30 docs a cada 4h ≈ **~180 documentos/dia**.
- Última execução de cada fonte (em 2026-06-15): Prefeitura, Câmara, PNCP e
  Transparência todas rodaram no mesmo dia — recorrência ativa.

### Visibilidade ao vivo
- **API:** `GET /api/scheduler/status` — estado dos três schedulers em tempo real.
- **Admin:** `/admin/coletas` (seção de schedulers) e `/admin/jobs`.
- **Histórico:** tabela `coletas_log` (coletas) e `transparencia_coletas_log`.

### Pós-coleta automático
Ao coletar um documento novo, dispara em cadeia: extração de texto → resumo IA
(trigger) → estruturação de produtos. O crosswalk despesa↔edital (match exato de
modalidade) roda a cada coleta de transparência; a consolidação de fornecedores
roda no fim da coleta de transparência.

---

## 5. Caminho recomendado para ~100%

1. **Rodar a análise integrada 2017–2022** (§3.1) — maior salto, ~1h, sem custo de infra.
2. **Deixar a API ligada** continuamente — o scheduler quita os 16 resumos
   pendentes e mantém tudo atualizado (12h coleta / 4h IA / 24h transparência).
3. **Decidir o OCR** (§3.3) — única dependência externa pendente; destrava
   vencedor/valor de ~13 processos antigos e os 32 editais-imagem.
4. **Recoleta dirigida dos `sem_pdf`** (§3.4) onde houver PDF publicado.
5. O que restar é **lacuna real da fonte** — exibida explicitamente, não escondida.
