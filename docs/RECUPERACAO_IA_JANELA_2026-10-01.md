# Recuperação limitada de IA — 01/10/2026

## Causa confirmada

O job 2658 (resumo 2433) foi encerrado às 16:54:57 UTC por timeout depois de iniciar o subtrecho 7.2 às 16:54:51. Restavam apenas seis segundos da fatia de oito minutos. As etapas anteriores ficaram preservadas, mas o término da fatia foi contado como falha do provedor e esgotou três tentativas.

Agora chamadas com menos de 30 segundos úteis são adiadas; há reserva de um segundo para registrar a continuação. Timeout provocado pelo prazo reduzido da própria fatia é continuação, não erro. Timeout de uma chamada com orçamento completo, erro de autenticação e falha antecipada do provedor continuam sendo erros reais. A regra vale para resumos de documentos, anexos e extração de itens. Identidades e checkpoints existentes não mudam.

## Consistência

- Consolidação e merge determinístico não convertem números ausentes (`null`) em zero.
- Um resumo não é salvo se o texto oficial mudou enquanto a IA trabalhava.
- Citação inválida ou string acima do contrato admite uma única subdivisão de recuperação por ramo. A segunda violação continua bloqueada. Não há truncamento de nomes/valores, exclusão de linhas para aprovar o contrato nem relaxamento da validação.
- A presença literal de campos e cobertura de caracteres é uma proteção verificável, não prova de extração semântica perfeita ou de correção do OCR.

## Verificação

144 suites / 1248 testes locais passaram. Lint: zero erros, três avisos preexistentes em pdf.js.
Inclui encerramento real de subprocesso após gravar um trecho em SQLite isolado: nenhum resumo parcial publicado; retomada não reenviou o trecho concluído. Inclui timeout reduzido, erro real, valores nulos, mudança de fonte, citação inventada e limite da recuperação de evidência.

## Retomada operacional

Após confirmação do deploy, autorizar somente os jobs 2658 (summary/2433), 2713 (items/2434) e 2711 (items/2441) ainda falhos, com a mesma entrada e checkpoints. Não zerar tentativas: o resumo recebe uma única nova oportunidade de erro real; continuações normais não consomem tentativas. Registrar exceção uma única vez em pipeline_meta. Não mexer no orçamento histórico, nos backups ou em outras falhas.

## Arquivos grandes: ainda pendentes

Três arquivos ultrapassaram o limite de resposta de 50 MiB. IDs 2153 e 2424 (Câmara), 1416 (Prefeitura). Metadados preservados; texto completo ausente, sem fingir que ementa é texto integral. HEAD em 01/10: dois timeouts na Câmara e HTTP 403 na Prefeitura; isso não prova tamanho atual nem corrupção. O limite global não foi elevado. Falta validar obtenção por fluxo limitado em disco e extração por páginas, sem ocupar toda a memória da VM. A política de revisão existente não foi apagada.
