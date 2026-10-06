# Campanha de resumos históricos (força-tarefa)

Objetivo: dar leitura/resumo por IA ao acervo histórico (leis, portarias, atas,
decretos da Câmara e da Prefeitura; ~1.200 documentos, boa parte recém-OCRizados)
sem esperar meses no teto padrão de 10 documentos/dia.

## Como funciona

O pipeline roda uma tarefa por vez. O trabalho em documentos **históricos**
(não recentes) tem dois tetos diários; publicações recentes têm prioridade 10 e
**não contam** neles:

| Variável (drop-in systemd) | Padrão | Significado |
|---|---|---|
| `PIPELINE_HISTORICAL_DOCS_PER_DAY` | 10 | documentos históricos distintos por dia |
| `PIPELINE_HISTORICAL_BUDGET_MS` | 3000000 | tempo de IA histórica por dia (ms) |

Drop-in na VM: `/etc/systemd/system/monitor-ritapolis.service.d/historico-campanha.conf`
(cópia versionada em `deploy/systemd/.../historico-campanha.conf`, valores da etapa
vigente). Aplicar: `sudo cp`, `sudo systemctl daemon-reload`,
`sudo systemctl restart monitor-ritapolis` (faça sem tarefa em execução).

## Limites do provedor (medidos em 06/10/2026, NVIDIA nemotron-3-super)

Probe a partir da VM, sem retry: até 8 chamadas simultâneas (~53 req/min em rajada)
sem erro; **429 a partir de ~116 req/min** (10 simultâneas). Uma chamada leva
4–6 s; o `summary` do pipeline leva 20–50 s em documentos curtos (overhead de
subprocesso/validação), então a campanha usa ~1–3 req/min — o provedor não é o
gargalo, o tempo por tarefa é. Concorrência permanece 1 (RAM da VM: 954 MB).

## Etapas

| Etapa | Docs/dia | Orçamento | Condição para avançar |
|---|---|---|---|
| 1 (06/10) | 50 | 3600000 (1 h) | 24 h sem alerta `campanha_*`, 0 erro 429 |
| 2 | 200 | 14400000 (4 h) | idem, 3 dias seguidos |

Estimativa: ~45 s/doc → ~15 h de IA para ~1.200 docs.

## Monitoramento

- **Endpoint** `GET https://api.ritapolis.com/api/saude/pipeline` ganha o bloco
  `campanha` (só números) enquanto `PIPELINE_HISTORICAL_DOCS_PER_DAY > 10`:
  `docs_24h`, `limite_docs_dia`, `pendentes`, `sem_resumo_com_texto`,
  `ultima_execucao`, `erros_limite_provider_24h`.
- **Alertas** (`status=alerta` → o workflow *Pipeline health (IA)* falha e o
  GitHub avisa por e-mail; roda a cada 6 h):
  - `campanha_limite_provider`: ≥ 1 erro 429 nas últimas 24 h → **voltar à etapa
    anterior** (reduzir docs/dia) e investigar.
  - `campanha_sem_progresso`: há fila histórica e nada rodou há > 36 h.
  - `tarefas_atuais_com_falha`: falhas reais (não revisão) — já existente.
- **Rotina diária (2 min):**
  `curl -s https://api.ritapolis.com/api/saude/pipeline | node scripts/check-pipeline-health.js`
  (imprime a linha `campanha:`). `sem_resumo_com_texto` deve cair a cada dia;
  `docs_24h` ≈ limite do dia enquanto houver fila.
- **VM**: workflow *VM capacity check* (diário, 03h43 BRT) cobre RAM/disco/swap; abortar a
  campanha se RAM livre < 150 MB persistir.

## Encerrar / reverter

Remover o drop-in, `daemon-reload`, `restart`. Volta a 10 docs/dia. Nada é
apagado: resumos já gerados ficam; a fila histórica restante segue no ritmo padrão.

## OCR dos PDFs-imagem (alimenta a campanha)

OCR é feito fora da VM e aplicado por `url_pdf`: ver `scripts/ocr-documentos-imagem.js
--exportar` e `scripts/aplicar-ocr-exportado.js`. Cada documento aplicado entra
sozinho na fila histórica.
