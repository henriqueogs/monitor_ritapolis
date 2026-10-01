# Complemento de fidelidade da retomada — 01/10/2026

Revisao posterior ao PR #93. Nao altera cadencia, modelo de IA, limites de download,
retencao de backup ou registros financeiros. Nao cria outra fila nem copias de PDFs.

- Resumo direto que precisou de chunking adaptativo salva essa decisao por texto,
  contrato e modelo. Retomada nao repete a requisicao direta que ja falhou.
- Extracao completa publica status `ok` e limpa o erro antigo de leitura no parser.
  Resultado do job conserva URL e hashes reais do arquivo/texto, sem copiar o texto.
- A verificacao de 30 dias aproveita essa leitura completa. Uma verificacao ja
  pendente pode reutiliza-la, mas apenas com a mesma URL, texto atual e idade valida.
- Alteracao de URL invalida o reaproveitamento. Alteracao de texto impede usar a
  extracao como prova do texto atual. Arquivo incompleto nao gera essa evidencia.
- Saude continua expondo a idade de toda a fila, mas o alerta automatico de 24h
  considera tarefas nao historicas. Historico aguardando o limite diario nao e,
  por si so, falha operacional; falhas atuais e pausa de seguranca continuam alertas.
- Indice tecnico por entidade/etapa/status evita varreduras da fila para cada URL.
- A mensagem `Request timed out` do SDK passa a ser transitoria, com o mesmo
  limite de tres tentativas. O reparo seletivo retoma a identidade existente
  somente quando restam tentativas, preservando checkpoints do resumo.

Em producao antes deste complemento, OCRs 2442, 2440 e 2439 concluiram. O
documento 2433 salvou a decisao de subdividir um trecho, nao um resumo parcial
validado, e encerrou por `Request timed out` mal classificado como permanente.
O documento 697 preservou dois resumos parciais validados entre reinicios.
Essa distincao foi confirmada lendo o conteudo dos checkpoints, nao apenas
contando linhas. Isso comprova progresso, nao fechamento
da cobertura dos 21 trabalhos afetados. Validacao de 24/48h continua pendente.

Testes locais: 133 suites / 1173 testes aprovados, incluindo fallback adaptativo
interrompido, URL alterada, texto alterado, nenhuma requisicao/gravação canonica na
verificacao reaproveitada e distincao entre atraso recente e backlog historico.
