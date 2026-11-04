# Status e próximos passos — 04/11/2026

Consulta em 04/11, aproximadamente 12h–12h15 (Brasília). Código de referência:
`origin/master`, `ca06164`, também confirmado na VM. SQLite aberto somente para
leitura. As correções desta rodada ainda precisam de merge, deploy e medição;
nenhum dado ou configuração de produção foi alterado.

## Estado do produto

O MVP está publicado. O sistema já entrega acervo, legislação da Prefeitura e
Câmara, licitações, folha, empenhos, receitas, fornecedores, análises de
documentos e admin com sessão. A próxima etapa é consolidar processamento e
qualidade dos dados e tornar a Na Lupa útil em escala.

| Área | Evidência atual | Pendência |
|---|---|---|
| Código e deploy | CI e deploy de 03/11 passaram; serviço ativo em `ca06164` | Publicar e medir as correções desta rodada |
| Testes | Master: 2.560 testes / 243 suítes no CI. Patch local: 2.564 / 243, todos passaram; lint sem erros, três avisos já existentes | CI do patch e medição após deploy |
| VM | 315 MB disponíveis, swap 145 MB, disco 42%, carga 0,83 no check de 04/11 às 11h51 | Medir CPU, I/O e latência após corrigir o ciclo de tarefas |
| R2 e backup | Guard de uso passou; fila registra snapshot confirmado em 04/11 às 03h00, dez cópias | A confirmação registrada não substitui ensaio de restauração |
| Acervo | 2.348 documentos: 1.314 Prefeitura, 1.024 Câmara, dez PNCP; 2.254 com pelo menos 50 caracteres | 94 abaixo do corte; tamanho do texto não certifica qualidade ou integralidade |
| Resumos recentes | Check das 03h48: oito documentos com texto nos últimos 30 dias, todos com resumo atual | Preservar prioridade dos recentes |
| Resumos históricos | Três textos sem qualquer resumo `ok`: IDs 992, 1566 e 1860 | Recuperar e validar pelo hash e contrato; este recorte não certifica os demais resumos |
| Fila histórica | 203 `facts`, 2.188 `source-check`, 140 janelas de despesas pendentes | Confirmar drenagem; tarefas executadas não equivalem a documentos concluídos |
| Na Lupa | Um publicado (#57), 224 em revisão, 81 rejeitados; scheduler desligado | Triagem editorial e protótipo interno por dossiê |
| Produtos | 13.158 registros; zero unidades com a string `undefined`, 7.779 unidades nulas | D1 corrigiu a gravação; recuperar unidades antes de comparar preços |

O check de capacidade não mede disponibilidade completa do site. GET de saúde
pela internet e por loopback na VM excederam 40 s nesta consulta, com serviço
ativo e tarefas sendo concluídas. A causa exata da latência continua pendente.
O navegador de pesquisa recebeu 403 na home; esse resultado isolado não
certifica queda do site.

## Problemas confirmados e correções preparadas

### Reprocessamento provocado pelas próprias datas técnicas

Nas 24 h anteriores à leitura, houve 1.476 execuções de `facts` sobre 201
documentos (244 minutos) e 1.474 de `analysis` (310 minutos). Há documentos
com 24 assinaturas diferentes em menos de dois dias.

`listarAnexosDocumento` expõe `resumo_criado_em` e `resumo_atualizado_em`.
O extrator de fatos atualiza o resumo local dos anexos e essas datas entravam
na assinatura da tarefa de fatos. Assim, uma execução podia gerar outra sem
mudança de conteúdo. A correção ignora também esses dois aliases de data,
preservando texto, hash, conteúdo do resumo e demais metadados. O teste de
regressão reproduz o ciclo com SQLite em memória e confirma que mudanças da
fonte ainda disparam processamento.

Não foi medida ainda a parcela das execuções da VM eliminada pelo patch.
A assinatura nova pode exigir uma primeira execução. Não apagar tarefas ou
checkpoints em lote.

### Saúde contava apenas a amostra de dez falhas

A leitura completa encontrou **499 tarefas com falha ainda sem substituição**,
por etapa e entidade, enquanto a API contava somente dez:

| Categoria atual | Total | Tratamento atual |
|---|---:|---|
| Revisão da fonte | 431 | Revisão |
| Contrato estrito rejeitado | 56 | Revisão |
| Limite de tamanho | 3 | Revisão |
| Timeout | 7 | Falha operacional |
| Contrato inválido | 1 | Falha operacional |
| PNCP HTTP 403 | 1 | Falha operacional, rotulada como credencial |

São **490 tarefas para revisão e nove falhas operacionais**, não 499 documentos
distintos. Um documento pode ter várias etapas retidas. O relatório anterior
de nove revisões e uma falha descrevia apenas a amostra.

A correção mantém os dez detalhes recentes e adiciona `failure_counts` com
totais completos por categoria, usados nas contagens e alertas da API.
O workflow também imprime esses totais. A consulta agregada levou cerca de
619 ms na leitura da VM; acompanhar o custo depois do deploy.

### PNCP bloqueado era apresentado como chave de IA inválida

A tarefa 41716, de 29/10, falhou com `PNCP HTTP 403`; a coleta de 22/10 foi
`ok`. O classificador passa a distinguir `fonte_bloqueada` de `credencial`,
mantendo o alerta. Isso corrige o diagnóstico; **o acesso ao PNCP ainda precisa
ser revalidado**. Não há evidência para trocar a chave NVIDIA ou declarar a
sincronização recuperada.

A fixture do teste de diagnóstico também foi corrigida: seu `/proc` fictício
usa 100 ticks/s, agora simulados em `getconf CLK_TCK` no Windows e Linux.

## Pull requests em aberto na consulta

| PR | Estado observado | Encaminhamento |
|---|---|---|
| [#218](https://github.com/henriqueogs/monitor_ritapolis/pull/218) | Correção do cache quando a conexão com a VM falha; CI e preview verdes, sem conflitos | Priorizar revisão junto da estabilização; medir disponibilidade e atualidade do dado após integrar |
| [#199](https://github.com/henriqueogs/monitor_ritapolis/pull/199) | Documentação de comunidade e guia de município; com conflitos | Atualizar base e resolver conflitos depois de estabilizar operação |
| [#192](https://github.com/henriqueogs/monitor_ritapolis/pull/192) | Detector interno de cruzamento societário/folha; com conflitos | Revisar em separado; preservar acesso somente administrativo e exclusão da IA/publicação |
| [#182](https://github.com/henriqueogs/monitor_ritapolis/pull/182) | Analytics, com zero arquivos alterados frente à base | Candidato a encerrar como redundante; código já presente |
| [#132](https://github.com/henriqueogs/monitor_ritapolis/pull/132) | Medição de cache de 08/10, ainda aberta | Conciliar evidência histórica com diagnóstico atual, sem apresentá-la como medição de novembro |

Nenhum desses PRs foi integrado ou encerrado nesta rodada.

## Sequência de execução

| Ordem | Trabalho | Critério de conclusão |
|---|---|---|
| P0 | Integrar e implantar assinatura estável e monitoramento completo | CI verde; contagens da API iguais à triagem; medir por 24 h a queda de tarefas repetidas |
| P1 | Triar nove falhas operacionais, recuperar três resumos e revalidar PNCP | Cada caso resolvido ou com bloqueio documentado; resumos válidos pelo hash e contrato atuais |
| P1 | Medir latência e drenagem das filas | Comparar I/O/CPU em dez minutos e progresso em 24 h; GET de saúde deixa de exceder 40 s |
| P2 | Agrupar 490 tarefas para revisão por documento/motivo | Manifesto com fonte, etapa e ação; piloto de dez recuperações preservando os gates |
| P2 | Na Lupa: avaliar N1 e iniciar N2 interno | Lote de 20 dossiês para revisão; primeiro credor/processo, depois legislação; medir custo/utilidade e aceitar zero evidências inventadas |
| P3 | Compras repetidas com cruzamento documental; depois divergências entre documentos | Pelo menos três casos úteis revisados, com período e fontes; recorrência não equivale a irregularidade |
| P3 | OCR e recuperação das unidades ausentes | Fonte integral, hash, proveniência e importação idempotente; unidade equivalente antes da comparação de preço |

N1 já tem contrato, orquestrador, persistência e dois detectores migrados em
`src/alertas/vertentes/`; D1/D2 também têm código integrado. Não refazer essas
entregas. A avaliação editorial e a recuperação de dados continuam necessárias.

Decisões de 29/10 preservadas: `/perguntar` estacionado, sem indexação ou abertura
pública; suspeitas do Analista IA só internas; scheduler da Na Lupa desligado
até decisão do mantenedor e precisão medida. Medir antes de ampliar paralelismo
ou limites. A6 (alerta de ritmo) continua no backlog: separar avanço útil de
execuções repetidas antes de usar `docs_24h` como indicador de desempenho.

## Evidências

- [CI/build de 03/11](https://github.com/henriqueogs/monitor_ritapolis/actions/runs/41707619071) e [deploy backend](https://github.com/henriqueogs/monitor_ritapolis/actions/runs/41707618986).
- [Capacidade da VM de 04/11](https://github.com/henriqueogs/monitor_ritapolis/actions/runs/41851788208) e [guard do R2](https://github.com/henriqueogs/monitor_ritapolis/actions/runs/41806919085).
- [Saúde do pipeline de 04/11](https://github.com/henriqueogs/monitor_ritapolis/actions/runs/41787939877).
- SQLite de produção somente em leitura: acervo, filas, execuções, estados
  editoriais, unidades e confirmação de backup. Contagens pontuais; não provam
  cobertura integral das publicações oficiais.
- [Decisões e fases da Na Lupa](PLANO_PROXIMAS_ATIVIDADES_2026-10-29.md).
