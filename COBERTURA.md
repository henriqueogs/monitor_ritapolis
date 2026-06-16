# Cobertura de Dados — Monitor Ritápolis

Levantamento da completude da base e da recorrência da coleta.

Atualizado em: 2026-06-16. Base: 547 documentos (516 editais).

> Como atualizar este documento: rode `npm run cobertura:relatorio` (ver §4) e
> cole os números. Os percentuais ao vivo estão em `/inteligencia` → "Cobertura
> dos dados por ano" e em `GET /api/inteligencia/cobertura`.

---

## 1. Visão geral (editais)

| Dimensão | Cobertura | Faltam | O que falta |
|---|---|---|---|
| Texto extraído | **93%** (478/516) | 38 | 38 sem PDF (recoleta) — PDF-imagem zerado via OCR |
| Resumo IA (contrato 1.x) | **97%** (500/516) | 16 | 16 sem texto (`sem_pdf`) |
| Análise integrada (2.0) | **88%** (456/516) | 60 | editais recentes sem grupo + sem texto |
| Vencedor identificado | **82%** (424/516) | 92 | resultado não publicado na fonte |
| Valor final | **44%** (227/516) | 289 | valor ausente na fonte / em ata escaneada |

**Resumo por ano agora 95–100% em todos os períodos** (antes 54% em 2017). Fila
de jobs de resumo (era 391) drenada via `npm run ai:worker`.

> **OCR local (sem IA) executado (16/06):** pdftoppm + tesseract.js processaram
> 32 editais PDF-imagem (texto 86%→93%) + 140 anexos escaneados. Restou 1 anexo
> ilegível e 38 `sem_pdf` (recoleta). Os 32 OCR'd entraram na fila de resumo→análise.

**Leitura:** acervo, texto, resumo e análise integrada estão maduros (86–90%). A
análise integrada saltou de **32% → 87%** com o lote 2017–2022. O que falta agora
é majoritariamente **estrutural**: os 42 editais sem texto (dependem de OCR/recoleta)
e poucos casos sem grupo ou com dados esparsos demais. As alavancas restantes são
**(a) OCR das atas/editais escaneados** (destrava texto→resumo→análise→vencedor→valor)
e **(b) recoleta dos `sem_pdf`** onde houver PDF publicado.

---

## 2. Cobertura por ano (editais)

| Ano | Editais | Vencedor | Valor | Resumo | Análise |
|----:|----:|----:|----:|----:|----:|
| 2026 | 35 | 97% | 86% | 100% | 74% |
| 2025 | 68 | 87% | 69% | 91% | 71% |
| 2024 | 46 | 93% | 83% | 96% | 78% |
| 2023 | 62 | 95% | 58% | 100% | 90% |
| 2022 | 51 | 98% | 53% | 98% | **98%** |
| 2021 | 50 | 92% | 22% | 100% | **100%** |
| 2020 | 65 | 65% | 17% | 83% | **82%** |
| 2019 | 56 | 71% | 21% | 95% | **89%** |
| 2018 | 42 | 76% | 17% | 100% | **95%** |
| 2017 | 35 | 14% | 3% | 100% | **100%** |
| 2016 | 3 | 100% | 0% | 100% | 100% |
| 2013 | 1 | 100% | 0% | 100% | 0% |

A leitura integrada (Análise) foi executada para todos os anos. O que ainda falta
em cada ano são editais **sem texto** (PDF-imagem/sem PDF) — sem texto não há
resumo nem análise. Curiosidade: 2024–2026 têm análise um pouco menor (71–78%)
porque incluem editais recém-coletados ainda sem grupo de processo formado.

---

## 3. Gaps detalhados e como fechá-los

### 3.1 Análise integrada 2017–2022 — ✅ CONCLUÍDA
- Lote executado: **análise 32% → 87%** (447/516). Anos 2017/2021/2016 a 100%.
- O que restou são editais **sem texto** (dependem de OCR/recoleta) + 2 docs de
  2013 com dados esparsos demais para o contrato 2.0 (erro recorrente, aceitável).
- Comando (reentrante): `npm run ai:correlacionar:lote -- --de=YYYY --ate=YYYY`.

### 3.2 Resumo IA — ~8 editais prontos
- ~8 editais com texto `ok` ainda sem resumo 1.x → o **ai-daily-scheduler**
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
- Última execução de cada fonte (em 2026-06-16): Prefeitura, Câmara, PNCP e
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

1. ~~Análise integrada 2017–2022~~ ✅ **feito** (32% → 87%).
2. **Decidir o OCR** (§3.3) — agora a **alavanca #1**. Destrava texto dos 32
   editais-imagem + 141 anexos escaneados → cascata resumo→análise→vencedor→valor.
3. **Recoleta dirigida dos `sem_pdf`** (§3.4) onde houver PDF publicado (38 editais).
4. **Deixar a API ligada** continuamente — o scheduler quita os ~8 resumos
   pendentes e mantém tudo atualizado (12h coleta / 4h IA / 24h transparência).
5. **Validação de produtos** já é automática via IA (`npm run licitacoes:validar-produtos-ia`):
   fila manual em 49 itens; só auto-valida, nunca auto-rejeita.
6. O que restar é **lacuna real da fonte** — exibida explicitamente, não escondida.
