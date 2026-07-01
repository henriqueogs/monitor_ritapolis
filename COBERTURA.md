# Cobertura de Dados — Monitor Ritápolis

Relatório gerado automaticamente a partir de `data/ritapolis.db`.

Atualizado em: 2026-06-26. Gere novamente com `npm run docs:dados`.

## Visão Geral

- Documentos: **553**
- Editais: **519**
- Texto extraído: **550/553 (99%)**
- Vencedor identificado: **465/519 (90%)**
- Valor final identificado: **251/519 (48%)**
- Produtos estruturados: **4656** em **377** documento(s)
- Lacunas classificadas de preço por item no mandato atual: **13**
- Fornecedores consolidados: **494**
- Descobertas/alertas: **ativo: 49**
- Automação de descobertas: **ligada**; último ciclo: **2026-06-26T12:16:56.557Z**; pendente: **não**

## Cobertura Por Ano (Editais)

| Ano | Editais | Vencedor | Valor | Resumo | Análise |
| --- | --- | --- | --- | --- | --- |
| 2026 | 40 | 93% | 85% | 100% | 100% |
| 2025 | 68 | 91% | 74% | 100% | 100% |
| 2024 | 49 | 96% | 82% | 100% | 76% |
| 2023 | 60 | 97% | 65% | 100% | 98% |
| 2022 | 51 | 100% | 55% | 100% | 98% |
| 2021 | 50 | 96% | 22% | 100% | 100% |
| 2020 | 65 | 77% | 25% | 100% | 80% |
| 2019 | 56 | 79% | 27% | 100% | 89% |
| 2018 | 41 | 80% | 22% | 100% | 98% |
| 2017 | 36 | 69% | 17% | 94% | 94% |
| 2016 | 2 | 100% | 0% | 100% | 100% |
| 2013 | 1 | 100% | 0% | 100% | 0% |

## Cobertura Por Mandato (Editais)

| Mandato | Anos no banco | Editais | Vencedor | Valor | Resumo | Análise |
| --- | --- | --- | --- | --- | --- | --- |
| 2025-2028 | 2026, 2025 | 108 | 92% | 78% | 100% | 100% |
| 2021-2024 | 2024, 2023, 2022, 2021 | 210 | 97% | 56% | 100% | 93% |
| 2017-2020 | 2020, 2019, 2018, 2017 | 198 | 77% | 23% | 99% | 89% |
| 2013-2016 | 2016, 2013 | 3 | 100% | 0% | 100% | 67% |

## Cobertura IA: Resumo vs Análise Integrada

Resumo IA organiza o documento individual: objeto, datas, valores, partes, itens e campos não encontrados.
Análise integrada deve agregar valor diferente: cruza fontes estruturadas, produtos, grupo da licitação, PNCP/ata/contrato quando houver, e transforma isso em consistências, lacunas e alertas.

| Mandato | Editais | Resumo | Análise | Ambos | Só resumo | Sem IA |
| --- | --- | --- | --- | --- | --- | --- |
| 2025-2028 | 108 | 108 (100%) | 108 (100%) | 108 (100%) | 0 (0%) | 0 |
| 2021-2024 | 210 | 210 (100%) | 196 (93%) | 196 (93%) | 14 (7%) | 0 |
| 2017-2020 | 198 | 196 (99%) | 176 (89%) | 176 (89%) | 20 (10%) | 2 |
| 2013-2016 | 3 | 3 (100%) | 2 (67%) | 2 (67%) | 1 (33%) | 0 |

## Qualidade da Análise Integrada

Classificação por confiança da última análise integrada: alta ≥ 0,70; média 0,45–0,69; baixa < 0,45.

| Mandato | Análises | Alta | Média | Baixa | Confiança média |
| --- | --- | --- | --- | --- | --- |
| 2025-2028 | 108 | 86 (80%) | 8 (7%) | 14 (13%) | 0.691 |
| 2021-2024 | 196 | 133 (68%) | 27 (14%) | 36 (18%) | 0.648 |
| 2017-2020 | 176 | 69 (39%) | 32 (18%) | 75 (43%) | 0.535 |
| 2013-2016 | 2 | 1 (50%) | 0 (0%) | 1 (50%) | 0.525 |

## Qualidade de Produtos e Preços

Esta seção separa falta de dado acionável de casos em que preço por item não deve ser inventado. A regra é conservadora: orçamento estimado de edital não vira preço final, valor global não é rateado sem base documental, e leilão/concessão/autorização de uso não entram como preço unitário comum.

| Classificação | Total |
| --- | --- |
| resultado_final_nao_publicado:ha_orcamento_ou_edital_mas_nao_ata_resultado | 4 |
| preco_item_nao_aplicavel:leilao_bens_inserviveis | 3 |
| preco_item_nao_aplicavel:concessao_ou_autorizacao_uso | 2 |
| valor_global_sem_rateio:valor_final_do_processo_nao_deve_ser_rateado | 2 |
| fonte_sem_detalhamento_por_item:sem_anexo_resultado_e_sem_preco_por_item | 2 |

| Doc | Ano | Produtos | Valor global | Lacuna | Ação |
| --- | --- | --- | --- | --- | --- |
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
| Editais sem PDF e sem texto | 0 | Recoleta dirigida ou marcar lacuna irrecuperável da fonte |
| Editais sem PDF, com texto da página | 37 | Manter como lacuna explícita de arquivo, com texto oficial preservado |
| Resumos IA sem texto-fonte atual | 0 | Revalidar rastreabilidade antes de exibir como verificável |
| Editais sem produtos estruturados | 149 | Rodar estruturação/enriquecimento em lotes por ano |
| Produtos sem preço final por item no mandato atual | 13 | Priorizar resultado_final_nao_publicado, anexos pendentes e parser_pendente; não ratear valor global sem base |
| Anexos aguardando OCR | 0 | Rodar OCR local ou fornecedor visão |
| Documentos sem data_publicacao | 19 | Backfill por título/fonte quando confiável |
| Análises integradas média/baixa no mandato atual | 22 | Rodar dados:analises-fracas e atacar causas: produtos, valores, PNCP, grupo ou PDF |

## Transparência

| Ano | Empenhos | Total | Credores | Vinculadas |
| --- | --- | --- | --- | --- |
| 2026 | 1949 | R$ 19.110.944,50 | 168 | 346 (18%) |
| 2025 | 4550 | R$ 28.330.599,56 | 166 | 602 (13%) |
| 2024 | 5232 | R$ 29.642.751,51 | 180 | 720 (14%) |
| 2023 | 4790 | R$ 20.451.608,91 | 196 | 958 (20%) |
| 2022 | 282 | R$ 833.765,31 | 45 | 66 (23%) |

## Integridade

- Registros órfãos: anexos=0, resumos=0, produtos=0
- PDFs duplicados: 0
- Hashes de conteúdo duplicados: 0
- Tamanho de `data/`: 2.0 GB; backups SQLite: 15 (1.8 GB)

## Comandos

```bash
npm run dados:status
npm run dados:auditar
npm run dados:analises-fracas
npm run dados:produtos-lacunas
npm run docs:dados
npm run dados:organizar-backups -- --apply
```
