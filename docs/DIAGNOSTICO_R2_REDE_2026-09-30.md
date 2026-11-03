# Diagnostico das falhas de rede do backup — 30/09/2026

## Resultado comprovado

- API permaneceu ativa durante o diagnostico, sem restart provocado por esta investigacao.
- A compactacao L1 concluiu em 30/09/2026 as 04:00:37 UTC, cobrindo ate o TXID `00000000000bb972`.
- O backup mais recente foi restaurado em pasta temporaria privada, separada do banco de producao, com paralelismo 1 e verificacao completa de integridade. Resultado `passed` as 04:03:37 UTC, em aproximadamente 3 minutos, no mesmo TXID.
- Banco restaurado: 355.368.960 bytes; 2.332 documentos, 30.704 despesas, 1.219 receitas e 25.601 registros de folha. Contagens nao equivalem a uma auditoria semantica de cada vinculo financeiro.
- Cinco leituras S3 autenticadas do trecho do objeto mencionado no erro anterior tiveram sucesso, sem retry do SDK no teste. O objeto existe. Nao foram publicados tokens nem dados pessoais.

## Falha anterior de compactacao

O ultimo erro L2 observado antes do deploy foi `connection reset by peer` seguido de `max retries exceeded reading ltx file`. Na consulta de 03:57:50 UTC havia 1.832 arquivos L1, enquanto L2 e L3 tinham arquivos antigos de 01/09. Incrementais e snapshots atuais existiam; a falha da compactacao antiga nao provou que o backup inteiro estivesse inutilizavel.

O comportamento e compativel com o relato de backlog grande e esgotamento de retries em [Litestream #1467](https://github.com/benbjohnson/litestream/issues/1467). A versao instalada e v0.5.17. O codigo dessa versao limita a retomada das leituras de um mesmo arquivo a tres retries. Isto explica o formato do erro, mas nao identifica com certeza qual equipamento ou rota encerrou a conexao. As leituras de teste e a restauracao posterior passaram; nao e correto concluir apenas desses resultados que futuras compactacoes L2 estao corrigidas.

Nao foram aumentados os retries, trocada a versao do replicador nem apagadas replicas para contornar o problema. O proximo ciclo L2, configurado a cada 6h, sera observado pelo monitor antes de propor manutencao adicional.

## Avisos diferentes, que nao devem ser confundidos

- `shutdown sync interrupted`: ocorreu durante o restart de publicacao; cancelamento nessa janela nao deve ser contabilizado como uma nova interrupcao espontanea da rede.
- `timeout waiting for db initialization`: os monitores de compactacao aguardam 30s, enquanto o monitor do banco esta configurado para o primeiro tick em 15 minutos. O codigo v0.5.17 confirma essa sequencia; os incrementais posteriores e a compactacao L1 bem-sucedida mostram que o aviso inicial nao foi prova de corrupcao. Nao executar a sugestao de apagar o estado local contida no log.
- `maxContentLength ... 52428800`: duas fontes oficiais devolveram arquivos acima do limite de 50 MiB; e uma protecao de tamanho, nao uma falha de conexao com R2. Aumentar o limite indiscriminadamente colocaria a VM pequena em risco. As tentativas repetidas para este erro deterministico merecem ajuste proprio, nao mais retries de rede.
- `ECONNRESET` do PNCP: houve erros da coleta dessa fonte as 03:59 UTC. Sao outra origem de requisicao e precisam ser tratados separadamente da replicacao S3. Esta investigacao nao atribuiu esses erros ao R2.

## Verificacao programada

O heartbeat existente `monitorar-consumo-do-r2` foi atualizado, mantendo o intervalo de 6h e o mesmo chat. Usa consultas, compara deltas com a linha de base de 03:34:52 UTC, faz a primeira conclusao apos pelo menos 24h de dados posteriores ao deploy e confirma apos 48h. Tambem verifica API, incrementais, snapshots e progresso L2/L3 quando SSH estiver disponivel.

Avisos sao reservados a conclusao, falha, piora material ou necessidade de acao. Nao executa restores pesados, reinicios, exclusoes, alteracoes de limites nem disparos de workflow automaticamente. A copia temporaria restaurada e seus arquivos auxiliares sao removidos apos a verificacao; os backups remotos e o banco de producao sao preservados.
