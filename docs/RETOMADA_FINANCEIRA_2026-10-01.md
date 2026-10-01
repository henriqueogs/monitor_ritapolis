# Retomada de coletas financeiras longas

## Operação

Despesas, receitas e folha usam o mesmo `pipeline_progress` e a mesma identidade
de job da fila existente. Não há nova fila, arquivos de backup ou cadência.

- Cada entrada oficial analisada fica preservada uma vez durante o job.
- Uma segunda entrada pequena guarda cursor e contadores acumulados; ela é
  atualizada, não criada novamente a cada registro. A folha tem duas entradas
  por grupo de admissão, além dos marcadores de exercícios concluídos.
- Registro canônico e avanço do cursor compartilham uma transação SQLite.
- Uma interrupção retoma no primeiro registro não confirmado. Grupos, janelas
  e anos concluídos não são importados nem contabilizados novamente.
- O plano original conserva datas e exercícios mesmo se a retomada ocorrer
  após virada de mês ou ano. Um job novo examina uma resposta nova da fonte.
- Checkpoints são removidos somente na transação que confirma sucesso da fila,
  não no subprocesso antes de o coordenador receber o resultado.
- Cookies/tokens de sessão não são persistidos. Uma nova sessão é aberta apenas
  quando a etapa pendente precisa consultar a fonte.

## Exatidão e segurança

O exercício do CSV deve corresponder ao exercício solicitado. O detalhamento
de despesa deve trazer o número exato do empenho. Falha de rede, HTML inválido
ou identidade contraditória não autorizam sobrescrever o registro existente
com informações parciais ou marcar o item como concluído.

Os clientes conservam os limites de resposta e redirecionamentos e validam
URLs, inclusive antes do proxy. Os timeouts respeitam a fatia restante da fila.
Continuação voluntária não é registrada como falha de coleta.

As oito formas de admissão continuam sendo consultadas: reduzir para uma busca
genérica perderia agentes políticos e comissionados, conforme evidência anterior
registrada no código. Não foi alterada a cobertura de categorias.

## Verificação

Testes com SQLite isolado cobrem cursor/contadores, retomada HTTP, oito grupos,
anos e janelas, divergência de exercício e empenho, rollback e encerramento
real de subprocesso tanto depois de um registro confirmado quanto dentro de
uma transação não confirmada. Os registros finais são idênticos e únicos.

Uma consulta real isolada, sem gravar dados canônicos, confirmou HTTP 200,
sessão válida, número exato, credor e histórico no detalhamento oficial do
empenho `00001-000`, exercício 2025, em 01/10/2026 às 16:09:37 UTC.
A consulta sem sessão/encoding adequado não validava o registro; o teste real
foi repetido com o protocolo efetivo do coletor (cookie e Latin-1).

Isso não substitui a validação da próxima coleta financeira agendada em
produção nem prova cobertura completa de todos os dados publicados. Não
disparar reimportação histórica global apenas para produzir uma evidência.
