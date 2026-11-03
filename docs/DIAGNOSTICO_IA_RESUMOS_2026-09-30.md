# Diagnóstico dos resumos por IA em produção

Verificação: 30/09/2026, 01h20 (America/Sao_Paulo), 04h20 UTC.
Escopo: diagnóstico; nenhuma geração de IA, alteração do banco, reinício ou publicação realizada nesta verificação.

## Resultado

A geração automática está habilitada, mas a entrega de resumos dos documentos recentes está atrasada. Foram encontrados dois problemas distintos: disputa de execução com a coleta e prioridade incorreta na seleção dos documentos.

## Evidências atuais

- Último resumo bem-sucedido: 28/09/2026 às 01h06 de Brasília, modelo `nvidia/nemotron-3-super-120b-a12b`.
- Último lote concluído registrado: 30 documentos selecionados, 30 sucessos, nenhum erro.
- Nos últimos 30 dias: 10 documentos com texto extraído e sem resumo, sendo 9 editais e 1 resolução; outros 5 documentos não possuem texto extraído.
- Pendência para o texto atual e contrato de resumo 1.1: 431 documentos. Isso não significa que todos nunca tiveram resumo; o critério exige hash atual e versão compatível.
- Configuração: IA e agendamento habilitados; chave configurada; 30 documentos por ciclo, intervalo de 4 horas, execução sequencial.
- O endpoint público de saúde retorna `alerta`, com `sem_resumo_ok_24h` e `maioria_recentes_sem_resumo`; nenhum ciclo registrado desde o reinício atual.
- O workflow `Pipeline health (IA)` também detectou o atraso e falhou na execução https://github.com/henriqueogs/monitor_ritapolis/actions/runs/36663718247.
- Banco consultado com `DatabaseSync(..., { readOnly: true })`; fontes de produção inspecionadas no commit `27f1308523e08dd3080ebd498a34312a78998ba5`.

## 1. Coleta ocupa a vez da IA

O código em produção usa uma trava compartilhada entre os agendamentos. `update-runner` mantém essa trava durante toda a coleta, liberando-a apenas no `finally`. Quando a trava está ocupada, `ai-daily-scheduler` retorna antes de registrar início ou resultado do ciclo.

A coleta automática atual começou às 00h33 de Brasília. Às 01h17, o banco ainda registrava a etapa `portal_transparencia` em andamento, enquanto a IA continuava sem ciclo registrado. Uma coleta anterior também permaneceu sem término até o reinício e foi marcada como erro pelo mecanismo de recuperação.

A serialização protege a VM pequena; remover a trava ou iniciar todas as tarefas em paralelo não é a solução recomendada. É necessário garantir oportunidade de execução entre lotes, além de limites de duração e tratamento de tarefas travadas.

## 2. Documentos antigos passam à frente dos novos

O caminho automático chama `listDocumentosPendentesResumoAi`. A ordenação é:

```sql
ORDER BY COALESCE(d.data_publicacao, d.atualizado_em) DESC, d.id DESC
```

Quando não existe data de publicação, a atualização técnica ocupa seu lugar. Na simulação somente de leitura do próximo lote real, os 30 selecionados eram documentos de 2025 sem data de publicação, atualizados em 27/09/2026. Nenhum dos 10 documentos recentes pendentes seria selecionado.

Portanto, simplesmente aguardar a coleta terminar não resolve a prioridade. Uma atualização técnica não deve tornar um documento histórico mais importante que um edital recém-publicado.

## Outros limites verificados

- O agendamento gera o resumo simples. A leitura integrada de edital e anexos, contrato 2.0, depende de endpoint administrativo ou script separado; não está incluída no ciclo automático inspecionado.
- Não havia jobs de resumo simples pendentes ou processando. O agendamento escreve resumos diretamente, portanto a tabela de jobs manuais não mede toda a atividade de IA.
- Os documentos 2433, 2434 e 2441 têm texto, mas nenhum resumo simples bem-sucedido. O documento 1068 tem resumo cidadão e hash compatível com seu texto atual. Isso confirma uma lacuna de processamento, não apenas uma ausência visual na página.
- Alguns textos recentes são curtos. A existência de texto, sozinha, não comprova que o documento oficial foi extraído integralmente.
- Não foi feita chamada de geração ao provedor; chave configurada não prova disponibilidade atual da inferência. Também não foi feita auditoria factual completa dos resumos antigos.

## Correção recomendada, ainda não executada

1. Priorizar documentos realmente recentes e nunca resumidos, sem usar atualização técnica como publicação.
2. Garantir vez para a IA entre lotes de coleta, mantendo apenas uma tarefa pesada em execução e respeitando limites da VM.
3. Retomar inicialmente os 10 recentes com texto, validando suficiência da fonte; extrair texto dos outros 5 antes de resumir.
4. Separar claramente resumo simples, análise integrada e estruturação de itens, com estados verificáveis e sem reprocessar hashes já concluídos.
5. Confirmar a recuperação por resultados efetivamente gravados e pela saúde do pipeline, não apenas por configuração habilitada.
