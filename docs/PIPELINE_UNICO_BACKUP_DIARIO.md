# Operação simplificada

Uma base SQLite persistente na Oracle; uma fila SQLite com uma tarefa pesada
por vez em subprocesso (256 MB de heap, timeout 10 min). Não há coleta ao abrir
o portal. Falha transitória tenta no máximo três vezes, com espera de 30 min e
2 h. Falha permanente pede revisão; não recomeça a cada leitura do site.

## Cadência (America/Sao_Paulo)

- Documentos: 08h e 20h, quatro fontes oficiais separadas.
- Despesas: 20h, últimos sete dias e lacunas desde o último intervalo concluído;
  datas cruzando dezembro/janeiro são separadas por exercício.
- Receitas e folha: diária; sem regravar valores iguais.
- PNCP: semanal; acionamento manual usa a mesma fila.
- Reconciliação financeira: ano atual/anterior mensal, históricos trimestral;
  janelas de sete dias, com checkpoints por tarefa.
- IA: texto → resumo → anexos → itens → leitura integrada → fatos/análise.
  Conteúdo/contrato iguais reaproveitam o resultado. Documentos recentes têm
  prioridade por publicação/primeira coleta, nunca por regravação técnica.
  Histórico: até 10 documentos/dia; manutenção histórica total até 60 min/dia.
- Arquivos conhecidos: verificação mensal com ETag/Last-Modified quando a
  fonte os fornece; alteração de bytes invalida os derivados, não apaga história.
- Backup: 03h, snapshot consistente pela API de backup SQLite, integrity_check
  completo, gzip, SHA-256 e confirmação de upload. Prefixo privado
  `backups/snapshots-v1/`; até 7 slots diários + 4 semanais (máximo 11 arquivos),
  sem duplicar arquivo diário/semanal. Duas cópias locais validadas.

Backup igual reutiliza o objeto. A retenção só remove chaves da nova política
após confirmar upload/manifesto. Jamais remove o legado Litestream ou
`backups/latest`. Sem backup confirmado há 24h, ou guard ausente/atrasado 8h/
bloqueado, o coordenador pausa trabalhos; consultas públicas permanecem online.

## Interfaces e publicação

`POST /api/documentos/:id/correlacionar` retorna 202 + job. Consultar o progresso
em `GET /api/ia/pipeline/jobs/:id` (administrativo autenticado).
`GET /api/admin/status` e `/api/saude/pipeline` mostram fila/idade/pausa.
Resumos de outro hash não são apresentados ao público como atuais. Os gates
de procedência, evidências e aprovação editorial continuam obrigatórios;
IA não é comprovação de nomes/valores/vínculos.

Feature flags `PIPELINE_ENABLED=true` e `DAILY_SNAPSHOT_ENABLED=true` substituem
os quatro schedulers antigos; não devem ser usados junto de outro supervisor.
Antes de instalar `daily-pipeline.conf`, executar explicitamente
`node scripts/validate-daily-backup.js` e conferir restauração integral isolada.
Instalar receptor restrito do guard, atualizar workflow, preservar cópia do
drop-in anterior; então trocar ExecStart para `scripts/api.js`, desligar o
reinício semanal e conferir API/fila/resumos. Reverter o drop-in retoma o
supervisor legado sem apagar banco ou snapshots.

Sete dias de cópias novas validadas antecedem o levantamento para limpeza do
legado. Exclusão do legado exige aprovação específica posterior. Não existe
promessa de custo zero sem reconciliação da conta/fatura e outros buckets.
