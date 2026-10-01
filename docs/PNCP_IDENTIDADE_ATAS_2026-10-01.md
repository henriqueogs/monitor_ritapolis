# Identidade oficial das atas do PNCP

## Evidência e causa

A resposta da consulta de atas de 2026 da Prefeitura (CNPJ
18557553000105) contém cinco registros com `numeroControlePNCPAta`,
`numeroControlePNCPCompra`, `anoAta` e `cnpjOrgao`. Não contém o campo
separado `sequencialAta` exigido pelo coletor anterior.

Os controles são `18557553000105-1-000001/2025-000001` a
`18557553000105-1-000001/2025-000005`. O ano da ata é 2026, mas o ano
da contratação de origem é 2025. A URL deve preservar essa diferença.

Em 01/10/2026, os cinco endpoints oficiais abaixo retornaram HTTP 200,
com controle, órgão, contratação e sequencial correspondentes:

`https://pncp.gov.br/api/pncp/v1/orgaos/18557553000105/compras/2025/1/atas/{1..5}`

Não são URLs obtidas por semelhança textual. O sequencial final é parte
do controle oficial da própria ata. A API de integração retorna
`numeroControlePNCP`; a consulta retorna `numeroControlePNCPAta`.

Referência oficial da rota:
https://pncp.gov.br/manual/pt-br/latest/ata_de_registro_de_preco/consultar_ata_de_registro_de_preco.html

## Invariantes

- Todos os identificadores redundantes presentes devem concordar.
- Órgão, controle da ata e controle da contratação devem ter o mesmo CNPJ.
- `anoAta` e data de publicação nunca substituem o ano da contratação.
- Identificadores ausentes, inválidos ou contraditórios interrompem a etapa;
  não se publica uma referência estimada.
- Fornecedor e valor ausentes permanecem ausentes; valor desconhecido é NULL,
  não zero. O objeto oficial da consulta usa `objetoContratacao`.
- A identidade de armazenamento da ata é estável entre as duas APIs.

## Retomada controlada

Após publicar a correção, conferir `node scripts/retry-affected-pipeline.js
--pncp-ata` sem `--apply`. O reparo exige seleção explícita do erro exato de
identificador incompleto da ata, guarda de consumo vigente e backup confirmado
em até 24 horas. Mantém o mesmo job, versão, checkpoints e tentativas, abaixo
do limite de três; não inicia uma segunda fila nem coleta global nova.

O coletor mantém contadores de itens concluídos. Erros de uma tentativa
anterior continuam nos logs, mas não contam como erro da tentativa corrigida.
Erros ocorridos na tentativa atual continuam sendo reportados.

## Limitações

Validar estas cinco identidades não prova cobertura total do PNCP. A descoberta
de compras ainda precisa de auditoria específica para lacunas de sequenciais.
A alteração não modifica a cadência, os tetos do R2 nem a retenção de backups.
