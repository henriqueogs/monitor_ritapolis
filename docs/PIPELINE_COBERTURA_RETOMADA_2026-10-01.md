# Retomada e cobertura completa de anexos — 01/10/2026

Complemento aos PRs #93 e #94. Sem troca de modelo, aumento de limites,
mudanca de cadencia/backup, importacao financeira ou limpeza de legado.

## Anexos

O prompt antigo cortava o texto em 8.000 caracteres. Isso nao e resumo do
anexo inteiro. Agora o construtor rejeita truncamento silencioso; anexos
longos percorrem todos os trechos e consolidam seus resumos validados em
grupos limitados. Somente o resultado completo e publicado. O contrato e
`anexo-2.1-full` para textos maiores que 8.000 caracteres; os curtos mantem
`anexo-2.0`, sem regenerar os resumos validos que ja existem.

Checkpoints dependem do texto inteiro, metadados usados no prompt, modelo,
contrato e divisao. Mudanca de texto/modelo invalida o reaproveitamento.
Timeout, pausa, limite de trechos ou baixa qualidade na fila nao publicam
um fallback heuristico como trabalho concluido. Os caminhos administrativos
de anexos tambem recebem o progresso da fila. Fora da fila o fallback continua
explicitamente heuristico, com motivo registrado. `force` permanece explicito.

As consultas deixam de expor `anexo-2.0` de um texto longo como resumo atual;
o registro antigo e preservado, nao excluido. O planejador agenda somente a
dependencia desatualizada, sob o mesmo limite diario/prioridade existentes.
O texto_hash do resultado e calculado sobre o texto efetivamente resumido.
As instrucoes de consolidacao proibem somar valores repetidos ou associar
pessoas e valores de trechos diferentes sem relacao explicita. A validacao
estrutural nao substitui a conferencia factual dos resultados reais.

## Coletas

- Prefeitura: IDs dos cadastros, metadados e paginas parseadas; registros
  concluidos nao sao importados de novo na continuacao da mesma tarefa.
- Projetos da Camara: paginas e registros; vereadores: lista e mandatos.
  O download de mandatos termina antes da escrita do vereador.
- Contadores sao preservados a cada item concluido, nao somente no fim.
- Requisicoes do coletor base respeitam o prazo restante da fatia, sem
  remover protecoes de tamanho, URL, proxy ou numero de tentativas.

Isso complementa a retomada ja existente em legislacao, PNCP e OCR.
Nao afirma cobertura de retomada de TODOS os caminhos: os fluxos de CSV
financeiro/folha, itens estruturados e leitura integrada ainda precisam de
auditoria propria. Nao foi feita reimportacao massiva para testar.

## Evidencias e pendencias

O log passa a registrar reutilizacao de resumo parcial validado, sem imprimir
o conteudo do documento. A observacao em producao deve confirmar esse log na
retomada real; contar linhas de checkpoint nao prova reutilizacao de pedidos.

Em 01/10 as 15:06 UTC, cinco OCRs afetados haviam concluido (quatro recentes
e o historico 1581). Resumos atuais 1555 e 2442 concluidos; os demais ainda
na fila. Isso nao significa fechamento da cobertura. API, backup diario,
limites e consumo precisam continuar sendo observados por 24/48h.
