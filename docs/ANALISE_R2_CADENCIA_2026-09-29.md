# Cadência de coleta e backup do Monitor Ritápolis

> Revisão em 30/09: a proposta de um minuto abaixo foi substituída por incrementais de 15 minutos, snapshot diário e eliminação das regravações. Política atual: [R2_USAGE_GUARD.md](R2_USAGE_GUARD.md). Este relatório conserva as medições e hipóteses anteriores, não define a configuração vigente.

Análise de 29/09/2026, aproximadamente 23h35 (America/Sao_Paulo). Medições da VM e do R2 entre 02h18 e 02h35 UTC de 30/09. **Nenhuma configuração de produção foi alterada nesta análise.**

## Decisão recomendada

O banco não exige replicação em intervalos de um segundo. O gargalo atual é o número de operações de armazenamento, não sua capacidade em GB.

- Perfil sustentável a validar: gerar incrementais a cada **1 minuto**, enviá-los a cada **30 segundos**, compactar L1 a cada **15 minutos**, verificar retenção L0 a cada **5 minutos** e manter snapshot diário com retenção de **72 horas**.
- Transição no ciclo já consumido: começar com geração a cada **2 minutos**; objetivo de até **4.000 operações Classe A/dia**. Se a medição/projeção não couber no saldo, usar **5 minutos**, sem aumentar o limite preventivo.
- A diferença entre geração e envio implica exposição nominal de até **90 segundos** no perfil de 1 minuto e **150 segundos** no de 2 minutos, além de processamento, filas, rede e falhas. São objetivos de recuperação a medir, não garantias.
- Manter a atualização dos dados atuais. Reduzir regravações desnecessárias e separar coleta recente de reconciliação histórica.
- Resolver falhas de compactação e testar restauração antes de considerar o backup validado.

Se anotações/correções administrativas precisarem de perda zero, esses perfis não bastam: será necessário confirmar persistência remota dessas alterações ou adotar outra arquitetura de redundância. Dados reimportáveis da fonte oficial e trabalho manual têm riscos diferentes.

## 1. Inventário medido

| Indicador | Observação |
| --- | --- |
| SQLite principal | 355.368.960 bytes: 355,37 MB ou 338,91 MiB |
| WAL | 38.196.552 bytes na primeira amostra |
| Documentos | 2.331 |
| Anexos | 1.923 |
| Empenhos/despesas | 30.704 |
| Registros de folha | 25.601; não são 25.601 pessoas distintas |
| Produtos de licitações | 13.054 |
| Snapshot comprimido mais recente | 156.886.066 bytes, concluído em 30/09 00:00:33 UTC |
| Incrementais L1 após ajuste anterior | Aproximadamente 139 MB/dia, extrapolando dez horas completas |
| Disco da VM | Aproximadamente 45 GB totais, 8,6 GB usados e 36 GB livres |
| Memória do serviço | Entre aproximadamente 318 e 408 MiB nas amostras; pico registrado de 523 MiB |
| Litestream instalado | v0.5.17 |

Esses números não indicam necessidade imediata de serviço pago por capacidade. O volume diário de incrementais representa páginas SQLite alteradas, inclusive índices e regravações: **não representa crescimento líquido do banco nem documentos novos por dia**. Não há série longa suficiente para projetar com precisão o crescimento líquido futuro.

### Inventário direto do bucket às 02:31 UTC

Apenas três chamadas ListObjectsV2; nenhuma escrita, exclusão ou download do banco.

| Grupo | Objetos | Bytes |
| --- | ---: | ---: |
| L0: incrementais recentes | 203 | 6.313.144 |
| L1: compactações curtas | 1.820 | 372.811.960 |
| L2 | 1 | 94.958 |
| L3 | 1 | 138.416.233 |
| L9: snapshots completos | 3 | 471.997.099 |
| Backup legado em backups/latest | 2 | 48.423.822 |

Total: **2.030 objetos / 1.038.057.216 bytes**, aproximadamente 1,04 GB. As amostras diretas são sequenciais, não um snapshot atômico do bucket. O relatório Analytics anterior indicava 1,21 GB, com medição de armazenamento em 29/09 23:40 UTC; os valores não devem ser tratados como simultâneos.

L2 e L3 tinham última modificação em 01/09; o backup legado em 12/08. Não considerar esses objetos, isoladamente, uma cópia atual. Os snapshots L9 são recentes. A existência de snapshots não demonstra, sozinha, uma restauração íntegra até o último incremental.

## 2. Consumo e saldo

Último workflow observado: [execução 36650693158](https://github.com/henriqueogs/monitor_ritapolis/actions/runs/36650693158), concluída com sucesso técnico, mas **relatório em warning**. Checagem em 30/09 00:30:55 UTC, ou 29/09 21:30:55 em São Paulo.

| Métrica | Consumo do relatório | Limite preventivo | Percentual preventivo | Franquia oficial Standard |
| --- | ---: | ---: | ---: | ---: |
| Armazenamento observado | 1.208.901.262 bytes | 8.000.000.000 | 15,11% | 10 GB-mês |
| Classe A, contagem conservadora | 834.241 | 900.000 | 92,69% | 1.000.000/mês |
| Classe B | 1.750.752 | 8.000.000 | 21,88% | 10.000.000/mês |

A franquia de armazenamento é em **GB-mês**, não apenas tamanho instantâneo. O relatório atual inclui 34.707 operações DeleteObjects desconhecidas na Classe A por precaução. Assim, 834.241 é a contagem do disjuntor, não uma reconciliação final da fatura. Mesmo desconsiderando esse grupo, o problema de frequência continua relevante. A documentação lista DeleteObject entre operações gratuitas; não alterar a classificação do plural sem comprovação da correspondência de cobrança.

O guard configura ciclo no dia **12**, confirmado na variável do GitHub e na configuração da VM. Não foi conferida a fatura; portanto, 12/10 é uma hipótese operacional de renovação, não confirmação financeira.

### Ritmo depois do ajuste anterior

| Checagem UTC | Classe A | Classe B |
| --- | ---: | ---: |
| 29/09 15:55:56 | 810.788 | 1.719.945 |
| 29/09 20:51:21 | 823.885 | 1.735.771 |
| 30/09 00:30:55 | 834.241 | 1.750.752 |

Entre a primeira e a última amostra: 23.453 operações A em 8,583 horas.

- **2.732 operações A/hora**;
- **65.578 operações A/dia**;
- **1,967 milhão A em 30 dias**, se esse ritmo continuasse;
- projeção B no mesmo intervalo: aproximadamente **2,584 milhões em 30 dias**.

Essa extrapolação usa período de coleta ativa; não é a média garantida de um mês completo. Ainda assim, a carga é recorrente e não deve ser ignorada.

Saldo até 900.000 na amostra: **65.759 operações**. Ao ritmo medido, cerca de **24 horas** até o limite preventivo, contadas da amostra. Considerando renovação em 12/10, restavam 11,98 dias: média máxima aproximada de **5.490 operações A/dia**. Um alvo de **4.000/dia** deixaria cerca de 17.845 operações adicionais de margem nessa projeção. O saldo real diminui após a amostra e inclui atraso de telemetria.

## 3. Causa técnica principal

A configuração atual contém:

```yaml
monitor-interval: 1s
checkpoint-interval: 1m
replica:
  sync-interval: 30s
```

O primeiro intervalo determina com que frequência as alterações locais podem virar arquivos LTX. O segundo controla o envio. **Esperar 30 segundos para enviar não une automaticamente os arquivos gerados a cada segundo.** Na versão instalada, o loop de envio percorre os TXIDs pendentes e chama uploadLTXFile separadamente para cada arquivo L0.

Dez horas completas depois do ajuste anterior, entre 29/09 16h e 30/09 01h UTC, tiveram média de **2.310 arquivos L0 cobertos por compactações por hora**. Os 2.732 eventos Classe A/hora são compatíveis com essa fragmentação, somada a listagens, compactações, multipart e outras operações.

Os TXIDs contam lotes/arquivos LTX, **não transações SQL, pessoas ou registros financeiros**. As faixas dos logs estimam arquivos cobertos por compactação; não fornecem atribuição financeira exata de cada requisição R2.

O ajuste anterior de compactação e retenção reduziu parte do custo, mas **não foi suficiente**, pois manteve geração local a cada segundo. A análise anterior atribuiu peso excessivo à compactação e precisa dessa correção.

Fontes: [configuração oficial](https://litestream.io/reference/config/), [funcionamento do LTX](https://litestream.io/how-it-works/) e [código da versão v0.5.17](https://github.com/benbjohnson/litestream/blob/v0.5.17/replica.go).

## 4. Regravações que não significam informação nova

As últimas coletas concluídas para exercícios 2019–2024 registraram, somadas, **22.803 atualizações e zero inserções**, entre 29/09 16:25 e 30/09 01:18 UTC. Esse contador contabiliza UPSERT de registro existente; não demonstra que todos tiveram alteração real de conteúdo.

Inspeção do código:

- `src/db/transparencia-repo.js:194`: UPSERT atualiza os campos e atualizado_em incondicionalmente.
- `src/db/transparencia-repo.js:133`: hash_despesa é derivado de exercício + empenho; identifica o registro, **não detecta mudança do conteúdo**.
- `src/db/transparencia-repo.js:270`: classificação é chamada após cada UPSERT.
- `src/db/fts-despesas-repo.js:25`: trigger de busca textual executa exclusão/inserção em todo UPDATE, mesmo sem mudança dos campos indexados.
- `src/db/folha-repo.js:39`: folha também tem atualização incondicional.
- `src/coletores/portal-transparencia.js:157`: coleta percorre anos antigos antes do corrente e evita repetir apenas anos concluídos no mesmo dia UTC.

Às 02:30 UTC, o serviço já percorria novamente janelas de **2019**; o último sucesso registrado para despesas de **2026** era de 27/09 23:25 UTC. Isso demonstra risco de priorizar histórico enquanto dados atuais esperam, embora não prove que todos os dados de 2026 estivessem desatualizados.

Melhoria estrutural recomendada: distinguir **inserido, alterado de fato, conferido sem alteração e erro**. Comparar todos os campos relevantes/canonizados antes de gravar, incluindo valores, datas, identidade e referências. Atualizar FTS somente quando os campos indexados mudarem. Registrar conferência por lote/fonte sem provocar regravação individual de milhares de linhas. Não usar comparação que ignore correções financeiras ou altere vínculos.

## 5. Cadência proposta de backup

| Parâmetro | Atual | Proposta de transição | Perfil normal a validar |
| --- | --- | --- | --- |
| monitor-interval | 1s | 2m | 1m |
| sync-interval | 30s | 30s | 30s |
| checkpoint-interval | 1m | 5m | 5m |
| Compactação L1 | 5m | 15m | 15m |
| Compactação L2 / L3 | 1h / 24h | Manter inicialmente, investigando falhas | 1h / 24h, somente após validação |
| l0-retention-check-interval | 1m | 5m | 5m |
| l0-retention | 5m | Manter inicialmente | Manter inicialmente |
| Snapshot / retenção | 24h / 72h | Manter | Manter |
| Validação / verify-compaction | 6h / true | Manter | Manter |

Não desativar verificações para economizar sem validar a integridade. A retenção L0 exige cobertura por compactação; aumentar o intervalo de limpeza não significa descartar incrementais não cobertos. A mudança não remove registros do banco nem altera a periodicidade das fontes.

### Modelo de orçamento, não medição do perfil novo

Premissas de planejamento: escrita presente ao longo do dia; 1–3 arquivos L0 por verificação, contemplando trabalho de checkpoint; aproximadamente 1.600 operações A/dia adicionais para manutenção, paginação, compactações, verificações e multipart; reserva de 50% para variação/retries. Checkpoints por tamanho, lotes grandes, recuperação de backlog e mudanças de versão podem exceder o modelo. O fator três **não é um limite garantido do software**.

Fórmula: `(86.400 / intervalo_em_segundos × fator_1_a_3 + 1.600) × 30 × 1,5`.

| Geração | Estimativa conservadora A/30 dias | Exposição nominal geração + envio |
| --- | ---: | --- |
| 30 segundos | 202–461 mil | 60 segundos + rede/filas |
| 1 minuto | 137–267 mil | 90 segundos + rede/filas |
| 2 minutos | 104–170 mil | 150 segundos + rede/filas |
| 5 minutos | 85–111 mil | 330 segundos + rede/filas |

O perfil de um minuto oferece bom equilíbrio para operação normal. O perfil de dois minutos é mais prudente no ciclo atual, mas o extremo superior do modelo ainda pode superar o orçamento diário restante. Por isso exige medição após 6–12 horas e fallback para cinco minutos se a projeção não couber, **sem assumir gratuidade automaticamente**.

Meta permanente: **até 300 mil operações A por ciclo completo** e folga para coleta inicial, reprocessamento excepcional e restaurações. Expandir armazenamento sozinho não resolve consumo por fragmentação.

## 6. Cadência ideal das fontes

Estas são propostas de política, não configurações já implementadas nem cadências comprovadas de publicação das fontes.

| Trabalho | Cadência proposta | Condições |
| --- | --- | --- |
| Documentos/editais novos | 12h | Preservar a frequência atual; priorizar novos/alterados |
| Despesas do exercício corrente | 24h | Executar antes do histórico; medir idade do último sucesso do ano corrente |
| Exercício anterior | Semanal | Antecipar quando houver indício de retificação |
| Exercícios antigos | Reconciliação mensal, distribuída | Não abandonar histórico; permitir atualização manual/emergencial |
| Folha recente | Conferência diária de disponibilidade; importar só mudanças | Competências históricas em reconciliação periódica; preservar correções |
| PNCP recente | Avaliar 24h incremental, no lugar de 168h para a rotina recente | Medir limites e comportamento da API; separar conferência integral |
| IA/resumos | Manter ciclo 4h, somente pendentes/conteúdo alterado | Não reprocessar conteúdo idêntico; preservar proveniência e versão |

Não é necessário reduzir a coleta de notícias/documentos para economizar R2. O objetivo é **menos trabalho repetido e maior prioridade ao dado recente**, não limitar a expansão do acervo. Uma política que omita retificações antigas seria inadequada para informações sobre pessoas e dinheiro.

## 7. Problemas adicionais e critérios de segurança

1. **Compactação L2 falha repetidamente.** Nos logs desde 25/09, não houve sucesso L2 registrado; erros por dia: 18, 16, 20, 13, 7 e 1 no dia 30 parcial. Observadas falhas de rede/leitura e um erro de arquivo ausente; não foi demonstrada corrupção do banco. Investigar retries/backlog e testar cadeia restaurável isolada. Não apenas alongar o intervalo para ocultar o erro.
2. **Retenção local anormal.** Em 02:31 UTC, 42.695 L0 com mais de 24h ocupavam 2.187.940.148 bytes na VM. Há evidência de arquivos retidos, mas sua condição de órfão/necessidade de recuperação não foi comprovada. Não excluir antes de restauração validada e avaliação da posição remota.
3. **Backup legado antigo.** Os objetos backups/latest datam de agosto. Conferir o caminho de recuperação efetivamente usado e impedir fallback silencioso para cópia antiga. Nenhum objeto foi apagado ou sobrescrito.
4. **Guard não é teto financeiro instantâneo.** Agenda GitHub horária não implica execução pontual; as amostras recentes tiveram intervalos de aproximadamente 3h39 e 4h55. Analytics também tem atraso. Não prometer que apenas alertas impedem cobrança.
5. **Cobertura da conta.** O guard consulta um bucket específico. Para sustentar a conclusão de custo zero, reconciliar consumo total da conta/serviços e o ciclo real de cobrança; não assumir que buckets adicionais têm franquias independentes.
6. **Disjuntor afeta disponibilidade.** O workflow atual para a unidade inteira da API em falha do guard. Arquitetura recomendada: limitar replicação/escritas de forma controlada, preservar consulta dos dados existentes e pausar coleta/edições quando a proteção de backup não puder ser mantida. Isso requer implementação e validação; não está resolvido apenas por Restart=always.
7. **Privacidade.** Foram consultadas somente contagens/metadados e logs operacionais. Não foram incluídos nomes, documentos pessoais, valores recebidos, credenciais ou tokens neste relatório.

## 8. Ordem de execução após aprovação

1. Preparar janela de alteração, rollback e restauração isolada sem tocar no banco principal. Confirmar snapshot atual e continuidade dos incrementais.
2. Validar a proposta em configuração de teste compatível com v0.5.17; aplicar perfil de transição, sem elevar franquias preventivas.
3. Medir 6–12h e 24–48h, incluindo ciclo pesado de despesas/folha: PUT/LIST por hora, A/B, fila/idade do backup, WAL, disco e memória.
4. Exigir consumo A observado até 4.000/dia no ciclo atual, projeção abaixo de 900.000 com reserva para atraso e outras cargas; se não couber, ajustar para 5m ou limitar trabalhos com proteção explícita.
5. Investigar/reparar compactação e retenção, mantendo arquivos até demonstrar restauração segura. Medir tempo de recuperação, não estimá-lo como garantido.
6. Corrigir comparação de conteúdo e trigger FTS com testes de alterações reais, registros idênticos, NULL, valores/datas e referências financeiras.
7. Separar fila de dados atuais e histórico; mostrar última conferência da fonte, última alteração real e falhas parciais distintamente.
8. Confirmar faturamento da conta e fortalecer proteção independente de atrasos no GitHub. Só então avaliar reduzir geração de 2m para 1m.

Critérios de conclusão: restauração íntegra em destino separado; compactação sem falhas persistentes; consumo medido e projetado dentro do orçamento; dado corrente dentro de 24h da coleta bem-sucedida; serviço de consulta disponível durante contenção; nenhuma limpeza ou alteração de vínculo financeiro sem validação própria.

## Fontes e reprodutibilidade

- [Cloudflare R2 Pricing](https://developers.cloudflare.com/r2/pricing/): franquias, classes e cobrança GB-mês.
- [Cloudflare Billing](https://developers.cloudflare.com/billing/understand/how-billing-works/): ciclo de cobrança e orçamento.
- [Litestream Configuration](https://litestream.io/reference/config/): intervalos e controles.
- [Litestream How it works](https://litestream.io/how-it-works/): TXID e arquivos incrementais.
- [Litestream v0.5.17 replica.go](https://github.com/benbjohnson/litestream/blob/v0.5.17/replica.go): upload individual L0.
- [Litestream v0.5.17 db.go](https://github.com/benbjohnson/litestream/blob/v0.5.17/db.go): geração, checkpoint e retenção.
- Workflows auditados: 36650693158, 36629274001, 36593931726 e anteriores desde 23/09.
- Scripts de diagnóstico locais em `.codex-tmp/r2-volume-audit.py`, `r2-actions-history.js`, `r2-replica-inventory.js` e `r2-scheduler-audit.py`: leitura de logs, metadados, listagem S3 e SQLite `mode=ro` com `PRAGMA query_only=ON`. Foram enviados por stdin via SSH; não instalados na VM.

Limitações: sem acesso local ao token Analytics, não foi obtida série por operação/hora além dos relatórios Actions. Não foi consultada fatura nem executada restauração nesta análise. Projeções assumem carga e quotas descritas; não são garantia de custo zero ou de perda máxima de dados.
