# Recuperação seletiva — 04/11/2026

PR #220 integrado e publicado no backend e no frontend em `4addab6`, em
04/11 aproximadamente 22h01 (Brasília). CI da master e deploy do backend
aprovados; Vercel em `READY`, ambiente de produção. A saúde retornou HTTP 200
em 14,4 s, com contagem integral: nove falhas operacionais e 490 revisões.
O primeiro diagnóstico da VM mostrou zero OOM/restarts, 439 MB disponíveis,
swap 169 MB e CPU roubada de 32,2% numa amostra curta. Ainda não há comparação
de 24 h para atribuir redução de carga ao patch.

## Casos operacionais identificados

| Job | Etapa | Documento/entidade | Motivo anterior |
|---:|---|---|---|
| 41716 | collection | pncp | HTTP 403 em 29/10 |
| 25227 | summary | 1860 | JSON inválido em 22/10; uma tentativa |
| 12968 | summary | 1566 | Timeout em 15/10; três tentativas |
| 6086 | summary | 992 | Timeout em 16/10; três tentativas |
| 25793 | items | 293 | Timeout em 23/10; três tentativas |
| 16729 | items | 251 | Timeout em 19/10; três tentativas |
| 12975 | items | 238 | Timeout em 15/10; três tentativas |
| 12845 | items | 214 | Timeout em 14/10; três tentativas |
| 12690 | items | 216 | Timeout em 14/10; três tentativas |

O PNCP respondeu HTTP 200 tanto na máquina local quanto na VM nesta nova
checagem. Isso permite tentar completar a coleta retida; não comprova ainda
que todas as rotas da coleta terminam sem erro.

## Comando de recuperação

`scripts/recover-failed-jobs.js` exige de um a dez IDs e motivo explícito.
Sem `--apply`, só apresenta a prévia. Exemplo:

```bash
node scripts/recover-failed-jobs.js --job-ids=25227,12968,6086 --reason="Retomada apos correcoes de JSON e timeout" --allow-exhausted-once
```

Adicionar `--apply` somente depois de conferir a prévia. A aplicação:

- exige guard do R2 liberado e confirmação de backup com menos de 24 h;
- revalida hash/contrato; não retoma tarefa com fonte alterada ou substituição;
- aceita apenas timeout em resumo/itens, JSON inválido em resumo e HTTP 403
  na coleta PNCP (com nova consulta prévia à origem);
- preserva identidade, checkpoints, prioridade, classificação histórica e
  tentativas; não concede mais orçamento nem altera o limite diário;
- exige `--allow-exhausted-once` para uma tarefa que já gastou três tentativas;
  mantém o contador, de modo que falha na retomada encerra sem retries novos;
- registra `manual_recovery:<id>` em `pipeline_meta`, permitindo uma só
  recuperação manual por tarefa; a atualização é transacional;
- recusa itens que já ultrapassaram o teto de tempo por documento: esses
  continuam exigindo o fluxo local de itens ou revisão da fonte.

Enfileirado não significa concluído. Tarefas históricas continuam sujeitas ao
orçamento já gasto no dia e à prioridade dos documentos recentes. Validar
resultado canônico e atualidade do hash depois da execução.
