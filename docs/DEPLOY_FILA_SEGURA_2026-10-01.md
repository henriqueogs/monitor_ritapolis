# Deploy sem trabalhadores em dependencias parciais

Em 01/10/2026 o deploy #36882540828 executou `npm ci` enquanto a API e a
fila ainda estavam ativas. Na janela 15:13:22–15:14:42 UTC, jobs iniciados
encontraram `cheerio` ausente e um arquivo interno de `undici` ausente.
Evidencia: erros dos jobs 2667/2668, coincidentes com a instalacao. Os jobs
2683/2684 tambem interromperam nessa janela; confirmar erro antes de reparar.
Nao e falha da fonte, do R2 ou prova de corrupcao do banco.

O deploy agora faz verificacao de checkout limpo e fetch, para o servico
graciosamente, confirma a parada e somente entao atualiza codigo/dependencias.
Inicia a API apos instalacao concluida. Uma instalacao que falha permanece
visivelmente falha; nao inicia uma aplicacao parcialmente instalada.
Nao usa reset, checkout forcado, migracao destrutiva ou alteracao de `data/`.
A parada aumenta a breve indisponibilidade durante deploy; evita tarefas
executando sobre codigo/dependencias misturados. Release staging atomico
pode ser avaliado separadamente, sem criar agora outra infraestrutura.

O wrapper operacional `/opt/monitor-ritapolis/deploy.sh` foi atualizado com
a versao testada, antes do proximo merge. A versao anterior foi preservada
em `.codex-stage/deploy-before-quiesce-20261001.sh` na VM. Fonte canonica:
`scripts/oracle-deploy.sh`; futuras mudancas nesse wrapper precisam ser
instaladas explicitamente, nao apenas commitadas.

O reparo seletivo aceita `--deploy-from=ISO --deploy-to=ISO`, limitado a
15 minutos. So retoma tarefas atuais nessa janela com erro de modulo
ausente ou worker interrompido e menos de tres tentativas. Conserva a mesma
identidade, hash, versao, contagem de tentativas e checkpoints; nao cria outra
fila nem zera orcamento. Guard e backup recente continuam obrigatorios.
Sem parametros, o comportamento de reparo anterior continua restrito aos
problemas originalmente validados. Sempre consultar dry-run antes de aplicar.

Testes simulam comandos (nunca systemctl/SSH/npm de producao), ordem da
parada/instalacao/inicio, falha de instalacao e checkout sujo. O teste de reparo
verifica janela, exclusao de erros genuinos/fora da janela, tentativas e
preservacao dos checkpoints. Validacao real exige sucesso do deploy, API ativa
e progresso dos mesmos jobs sem novas falhas de dependencias.
