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

## Continuação da medição de I/O

Após o #220, a API ainda leu aproximadamente 3,21 GB em sete minutos. A auditoria
dos dez minutos seguintes ao deploy identificou sete tarefas `facts` e oito
`analysis`; a análise geral ainda retornava escopo de replanejamento `global`.
Isso zerava `planningAt` após cada análise, furando a cadência de cinco minutos
preservada pelo A11 para as demais etapas.

Correção adicional: `analysis`, que atualiza alertas e não acrescenta documentos
ou dependências de IA, passa a retornar escopo `nenhum`, como `source-check`.
Coletas e despesas mantêm o replanejamento global; etapas de IA por documento
mantêm o replanejamento da entidade. O teste de regressão falhou antes e passou
após a correção. A varredura global periódica de cinco minutos permanece ativa.
Medir novamente após o deploy; não atribuir melhoria apenas à mudança de código.

## Gargalo isolado na consulta de saúde

Perfil somente em leitura na VM (04/11, aproximadamente 22h18): a contagem
`GROUP BY status,kind` de `pipeline_jobs` levou **34.022 ms**. O SQLite escolhia
`pipeline_pending`, que não contém `kind`, lia os registros e ainda criava uma
árvore temporária para agrupar. A consulta do último resumo `ok` levou 3.266 ms,
com varredura de `documentos_resumos_ai` e ordenação temporária.

Correção: índice cobrindo `(status,kind)` na fila e índice de resumos por
`(status,atualizado_em DESC,id DESC)`. Os índices são criados idempotentemente
na inicialização normal; nenhum documento ou resultado de IA é alterado.
Testes reproduzem os planos antigos e exigem agrupamento por índice de
cobertura e busca do último resumo sem ordenação temporária. Medir latência
real após a criação inicial dos índices.

Após o #223, os tempos isolados foram 13 ms para contagens (antes 34.022 ms)
e 9 ms para o último resumo (antes 3.266 ms). O perfil do serviço completo
encontrou outro gargalo: a busca de erros históricos recentes levou 15.360 ms.
Ela recebe índice parcial por `(historical,finished_at,kind)`, somente para
linhas cujo erro não é nulo, evitando a varredura dos milhares de jobs antigos
sem erro. O critério da consulta permanece igual.

## Itens recusados pelo contrato estrito (`contrato_rejeitado`) — 24/11/2026

O contrato estrito de itens recusa de propósito saída incompleta da IA (ZodError). Em 24/11 a
saúde do pipeline listava 81 tarefas nessa categoria, paradas em revisão. A falha não vem
da fonte. Uma retomada reaproveita os trechos já validados (checkpoints) e repete só o
trecho recusado. A amostra disponível é de tarefas de itens, e só itens passam a ser
elegíveis. Um segundo recuso encerra a tarefa, porque vale uma retomada manual por tarefa.

Listar candidatos sem alterar nada (falha mais recente de cada etapa/documento, ainda sem
retomada manual):

```bash
node scripts/recover-failed-jobs.js --listar=contrato_rejeitado --limite=10
```

A saída traz `job_ids` pronto para a prévia e a aplicação, no máximo dez por vez:

```bash
node scripts/recover-failed-jobs.js --job-ids=<job_ids> --reason="Retomada de itens recusados pelo contrato estrito"
# conferir a prévia; tarefas com 3 tentativas pedem --allow-exhausted-once
node scripts/recover-failed-jobs.js --job-ids=<job_ids> --reason="..." --apply
```

Valem as mesmas travas: guard do R2 e backup com menos de 24 h, hash da fonte e versão do
contrato inalterados, teto de tempo de itens por documento e orçamento histórico do dia.
Começar por um lote de dez e medir quantas viram `ok` antes de seguir. Se a maioria voltar a
ser recusada, o problema está no modelo/prompt, não na sorte da amostragem. Nesse caso,
parar e revisar o prompt de itens.

## Backup diário morto pelo teto de 10 min — 27/11/2026

Todas as tarefas do pipeline tinham teto de 10 minutos. O worker que passava disso era morto com SIGKILL.
Com o banco em 3 GB e CPU roubada na E2.1.Micro, copiar, conferir e compactar o banco passou
desse teto. Cada tentativa deixava uma cópia parcial `pending-*` em `data/snapshots-v1/`. O
diagnóstico de 27/11 achou 141 sobras (20 GB, disco em 95%), e as gravações estavam pausadas
por `backup_older_than_24h`.

Correção: o backup tem teto de 60 min, com lease acompanhando o teto (`limiteExecucaoMs` em
`src/pipeline/policy.js`). Sobras `pending-*` com mais de 6 h são apagadas no início de cada
backup (`src/storage/snapshot-espaco.js`).

`npm run db:backup:r2` é o backup legado e **não** tira a pausa. Para não esperar o próximo
backup agendado (depois das 3h), retome a tarefa de backup que falhou. Para retomar só o
backup, não se exige backup recente, mas o guard do R2 continua valendo:

```bash
node scripts/recover-failed-jobs.js --job-ids=<id do backup> --reason="Backup morto pelo teto de 10 min" --allow-exhausted-once          # prévia
node scripts/recover-failed-jobs.js --job-ids=<id do backup> --reason="Backup morto pelo teto de 10 min" --allow-exhausted-once --apply
```
