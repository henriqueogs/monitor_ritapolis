# Cobertura de Dados — Monitor Ritápolis

Relatório gerado automaticamente a partir de `data/ritapolis.db`.

Atualizado em: 2026-09-17. Gere novamente com `npm run docs:dados`.

## Visão Geral

- Documentos: **2324**
- Editais: **556**
- Texto extraído: **1304/2324 (56%)**
- Vencedor identificado: **507/556 (91%)**
- Valor final identificado: **303/556 (54%)**
- Produtos estruturados: **13054** em **423** documento(s)
- Lacunas classificadas de preço por item no mandato atual: **17**
- Fornecedores consolidados: **821**
- Descobertas/alertas: **ativo: 297**
- Automação de descobertas: **ligada**; último ciclo: **2026-09-17T13:14:52.381Z**; pendente: **não**

## Cobertura Por Ano (Editais)

| Ano | Editais | Vencedor | Valor | Resumo | Análise |
| --- | --- | --- | --- | --- | --- |
| 2026 | 76 | 82% | 74% | 68% | 55% |
| 2025 | 69 | 90% | 72% | 100% | 100% |
| 2024 | 49 | 98% | 84% | 100% | 76% |
| 2023 | 60 | 97% | 65% | 100% | 98% |
| 2022 | 51 | 100% | 59% | 100% | 98% |
| 2021 | 50 | 98% | 34% | 100% | 100% |
| 2020 | 65 | 80% | 29% | 100% | 80% |
| 2019 | 56 | 91% | 46% | 100% | 89% |
| 2018 | 41 | 88% | 37% | 100% | 98% |
| 2017 | 36 | 78% | 19% | 100% | 94% |
| 2016 | 2 | 100% | 0% | 100% | 100% |
| 2013 | 1 | 100% | 0% | 100% | 0% |

## Cobertura Por Mandato (Editais)

| Mandato | Anos no banco | Editais | Vencedor | Valor | Resumo | Análise |
| --- | --- | --- | --- | --- | --- | --- |
| 2025-2028 | 2026, 2025 | 145 | 86% | 73% | 83% | 77% |
| 2021-2024 | 2024, 2023, 2022, 2021 | 210 | 98% | 60% | 100% | 93% |
| 2017-2020 | 2020, 2019, 2018, 2017 | 198 | 84% | 34% | 100% | 89% |
| 2013-2016 | 2016, 2013 | 3 | 100% | 0% | 100% | 67% |

## Cobertura IA: Resumo vs Análise Integrada

Resumo IA organiza o documento individual: objeto, datas, valores, partes, itens e campos não encontrados.
Análise integrada deve agregar valor diferente: cruza fontes estruturadas, produtos, grupo da licitação, PNCP/ata/contrato quando houver, e transforma isso em consistências, lacunas e alertas.

| Mandato | Editais | Resumo | Análise | Ambos | Só resumo | Sem IA |
| --- | --- | --- | --- | --- | --- | --- |
| 2025-2028 | 145 | 121 (83%) | 111 (77%) | 110 (76%) | 11 (8%) | 23 |
| 2021-2024 | 210 | 210 (100%) | 196 (93%) | 196 (93%) | 14 (7%) | 0 |
| 2017-2020 | 198 | 198 (100%) | 176 (89%) | 176 (89%) | 22 (11%) | 0 |
| 2013-2016 | 3 | 3 (100%) | 2 (67%) | 2 (67%) | 1 (33%) | 0 |

## Qualidade da Análise Integrada

Classificação por confiança da última análise integrada: alta ≥ 0,70; média 0,45–0,69; baixa < 0,45.

| Mandato | Análises | Alta | Média | Baixa | Confiança média |
| --- | --- | --- | --- | --- | --- |
| 2025-2028 | 111 | 87 (78%) | 9 (8%) | 15 (14%) | 0.686 |
| 2021-2024 | 196 | 133 (68%) | 27 (14%) | 36 (18%) | 0.648 |
| 2017-2020 | 176 | 69 (39%) | 32 (18%) | 75 (43%) | 0.535 |
| 2013-2016 | 2 | 1 (50%) | 0 (0%) | 1 (50%) | 0.525 |

## Qualidade de Produtos e Preços

Esta seção separa falta de dado acionável de casos em que preço por item não deve ser inventado. A regra é conservadora: orçamento estimado de edital não vira preço final, valor global não é rateado sem base documental, e leilão/concessão/autorização de uso não entram como preço unitário comum.

| Classificação | Total |
| --- | --- |
| valor_global_sem_rateio:valor_final_do_processo_nao_deve_ser_rateado | 4 |
| fonte_sem_detalhamento_por_item:sem_anexo_resultado_e_sem_preco_por_item | 4 |
| resultado_final_nao_publicado:ha_orcamento_ou_edital_mas_nao_ata_resultado | 4 |
| preco_item_nao_aplicavel:leilao_bens_inserviveis | 3 |
| preco_item_nao_aplicavel:concessao_ou_autorizacao_uso | 2 |

| Doc | Ano | Produtos | Valor global | Lacuna | Ação |
| --- | --- | --- | --- | --- | --- |
| #691 | 2026 | 5 | R$ 0,01 | valor_global_sem_rateio:valor_final_do_processo_nao_deve_ser_rateado | Não ratear; buscar documento com subtotal por item/lote |
| #690 | 2026 | 1 | n/a | fonte_sem_detalhamento_por_item:sem_anexo_resultado_e_sem_preco_por_item | Confirmar se a fonte publica detalhamento por item |
| #689 | 2026 | 48 | R$ 0,01 | valor_global_sem_rateio:valor_final_do_processo_nao_deve_ser_rateado | Não ratear; buscar documento com subtotal por item/lote |
| #687 | 2026 | 4 | n/a | fonte_sem_detalhamento_por_item:sem_anexo_resultado_e_sem_preco_por_item | Confirmar se a fonte publica detalhamento por item |
| #662 | 2026 | 1 | n/a | resultado_final_nao_publicado:ha_orcamento_ou_edital_mas_nao_ata_resultado | Aguardar/publicar resultado final; manter orçamento como estimado |
| #660 | 2026 | 9 | R$ 51.100,00 | preco_item_nao_aplicavel:concessao_ou_autorizacao_uso | Tratar como concessão/autorização de uso, não preço unitário comum |
| #612 | 2026 | 2 | R$ 15.740,71 | valor_global_sem_rateio:valor_final_do_processo_nao_deve_ser_rateado | Não ratear; buscar documento com subtotal por item/lote |
| #546 | 2026 | 1 | n/a | fonte_sem_detalhamento_por_item:sem_anexo_resultado_e_sem_preco_por_item | Confirmar se a fonte publica detalhamento por item |
| #625 | 2025 | 10 | n/a | resultado_final_nao_publicado:ha_orcamento_ou_edital_mas_nao_ata_resultado | Aguardar/publicar resultado final; manter orçamento como estimado |
| #547 | 2025 | 1 | n/a | fonte_sem_detalhamento_por_item:sem_anexo_resultado_e_sem_preco_por_item | Confirmar se a fonte publica detalhamento por item |
| #90 | 2025 | 8 | n/a | resultado_final_nao_publicado:ha_orcamento_ou_edital_mas_nao_ata_resultado | Aguardar/publicar resultado final; manter orçamento como estimado |
| #72 | 2025 | 2 | n/a | preco_item_nao_aplicavel:leilao_bens_inserviveis | Tratar como alienação/leilão, não compra com preço por item |
| #60 | 2025 | 8 | n/a | preco_item_nao_aplicavel:leilao_bens_inserviveis | Tratar como alienação/leilão, não compra com preço por item |
| #59 | 2025 | 24 | n/a | preco_item_nao_aplicavel:concessao_ou_autorizacao_uso | Tratar como concessão/autorização de uso, não preço unitário comum |
| #53 | 2025 | 1 | n/a | resultado_final_nao_publicado:ha_orcamento_ou_edital_mas_nao_ata_resultado | Aguardar/publicar resultado final; manter orçamento como estimado |
| #49 | 2025 | 7 | R$ 24.953,00 | valor_global_sem_rateio:valor_final_do_processo_nao_deve_ser_rateado | Não ratear; buscar documento com subtotal por item/lote |
| #43 | 2025 | 4 | n/a | preco_item_nao_aplicavel:leilao_bens_inserviveis | Tratar como alienação/leilão, não compra com preço por item |

## Gaps Prioritários

| Gap | Total | Ação |
| --- | --- | --- |
| Editais sem PDF e sem texto | 9 | Recoleta dirigida ou marcar lacuna irrecuperável da fonte |
| Editais sem PDF, com texto da página | 28 | Manter como lacuna explícita de arquivo, com texto oficial preservado |
| Resumos IA sem texto-fonte atual | 10 | Revalidar rastreabilidade antes de exibir como verificável |
| Editais sem produtos estruturados | 140 | Rodar estruturação/enriquecimento em lotes por ano |
| Produtos sem preço final por item no mandato atual | 17 | Priorizar resultado_final_nao_publicado, anexos pendentes e parser_pendente; não ratear valor global sem base |
| Anexos aguardando OCR | 0 | Rodar OCR local ou fornecedor visão |
| Documentos sem data_publicacao | 619 | Backfill por título/fonte quando confiável |
| Análises integradas média/baixa no mandato atual | 24 | Rodar dados:analises-fracas e atacar causas: produtos, valores, PNCP, grupo ou PDF |

## Transparência

| Ano | Empenhos | Total | Credores | Vinculadas |
| --- | --- | --- | --- | --- |
| 2026 | 3012 | R$ 34.265.165,22 | 220 | 356 (12%) |
| 2025 | 4550 | R$ 35.272.524,63 | 228 | 442 (10%) |
| 2024 | 5232 | R$ 36.686.817,63 | 231 | 615 (12%) |
| 2023 | 4790 | R$ 26.519.427,73 | 244 | 673 (14%) |
| 2022 | 3971 | R$ 22.987.172,35 | 237 | 544 (14%) |
| 2021 | 3064 | R$ 17.155.039,81 | 207 | 342 (11%) |
| 2020 | 2913 | R$ 16.223.909,18 | 216 | 323 (11%) |
| 2019 | 2956 | R$ 13.641.701,36 | 226 | 339 (11%) |
| 2018 | 108 | R$ 197.565,47 | 35 | 36 (33%) |
| 2017 | 2 | R$ 14.597,96 | 1 | 0 (0%) |

## Integridade

- Registros órfãos: anexos=0, resumos=0, produtos=0
- PDFs duplicados: 0
- Hashes de conteúdo duplicados: 0
- Tamanho de `data/`: 2.4 GB; backups SQLite: 0 (0 B)

## Comandos

```bash
npm run dados:status
npm run dados:auditar
npm run dados:analises-fracas
npm run dados:produtos-lacunas
npm run docs:dados
npm run dados:organizar-backups -- --apply
```
