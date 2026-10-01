# Consistencia e retomada do pipeline — 01/10/2026

## Escopo e protecoes

Uma fila SQLite e um subprocesso pesado por vez continuam sendo a operacao principal.
Nao foi criado outro scheduler ou fluxo de backup. IDs publicos, documentos, valores,
resumos validos e backups legados permanecem preservados.

- OCR: workaround isolado para Tesseract.js 7 / modelos float / relaxed SIMD
  ([relato upstream 1080](https://github.com/naptha/tesseract.js/issues/1080)).
  Mantem o modelo Portuguese best; nao troca reconhecimento por texto inventado.
- Checkpoints tecnicos por pagina de OCR, bytes reais do arquivo, modelo/contrato
  e trecho validado do resumo. Um resultado final exige todas as paginas/trechos.
- Continuacao voluntaria antes do limite de 10 minutos. Fatias consomem o orcamento
  historico diario, mas nao contam como falhas. Checkpoints concluidos sao removidos
  somente depois da persistencia do resultado; checkpoints pendentes sao conservados.
- Listagens/persistencia de legislacao da Camara e Prefeitura, e respostas/itens PNCP
  podem retomar etapas concluidas dentro do mesmo job.
- Upserts da Camara nao emitem UPDATE nem mudam timestamps quando todos os campos
  sao iguais, incluindo comparacao segura de NULL. Mudancas reais continuam sendo salvas.
- Verificacoes de arquivos usam 30 dias decorridos por URL, aproveitando o historico
  existente. Nao repetem toda a base na virada do mes.
- Limite de 50 MB mantido. Erros de tamanho nao sao retentados como falhas de rede.
  Arquivos acima do limite entram em revisao por 30 dias, sem repeticao de download
  a cada coleta; seus metadados oficiais sao preservados, sem fingir texto integral.
- PNCP exige identificadores do proprio registro para fonte oficial; nao deduz
  ano do contrato a partir da publicacao/compra, nem associa outro orgao.
- Saude publica considera falhas atuais e pausa de escritas. Cobertura de resumos
  exige hash do texto atual e contrato configurado, nao apenas qualquer resumo antigo.
- `scripts/retry-affected-pipeline.js` e dry-run por padrao. `--apply` enfileira
  apenas classes de falhas conhecidas corrigidas nesta revisao, mantendo jobs anteriores.

## Evidencia real ja obtida (staging na mesma VM, banco isolado)

Em 01/10/2026, sem alterar documentos de producao:

| Documento anteriormente com falha | Paginas completas | Caracteres OCR | Conclusao UTC |
| --- | ---: | ---: | --- |
| 2442 | 2 | 3686 | 13:43:26 |
| 2440 | 5 | 11514 | 13:46:42 |
| 2439 | 1 | 2488 | 13:47:25 |
| 2435 | 2 | 4964 | 13:49:01 |

Os quatro arquivos tinham zero caracteres na extracao nativa; a verificacao usou
os PDFs reais que falharam, o Node 24 e o mesmo modelo portugues da VM.
As 14:11:59 UTC, o documento 2442 tambem passou por encerramento real do worker
apos a primeira pagina: o novo worker reconheceu somente a segunda pagina e
produziu o mesmo SHA-256 do texto integral da execucao completa.
Os testes unitarios verificam retomada apos interrupcao, invalidacao por bytes/modelo,
ausencia de resumo final incompleto, deduplicacao sem UPDATE, virada do mes,
referencias PNCP e classificacao de erro por tamanho.

## Fechamento ainda necessario

Publicacao e CI, reprocessamento controlado em producao dos demais trabalhos afetados,
confirmacao dos resumos atuais por hash, progresso real nas coletas retomadas e
observacao do consumo/backup por 24 e 48 horas. Testes locais ou quatro PDFs nao
provam fechamento de toda a cobertura. Arquivos acima de 50 MB continuam exigindo
tratamento seguro/revisao, nao sao considerados extraidos.

Nao excluir legado automaticamente. Aferir ciclo/fatura antes de prometer custo zero.
