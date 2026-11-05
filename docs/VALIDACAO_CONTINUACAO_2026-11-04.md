# Continuação — evidências de 04/11/2026

Horários UTC de 05/11 abaixo ainda correspondem à noite de 04/11 em Brasília.

## Integração e navegação

- #225, commit `8a6f3fb`: CI master e deploy backend aprovados; Vercel de
  produção `dpl_7JyKZ8xSxXwvaGwoWp4yE6EyvhXM` em READY.
- Navegador real abriu a home, `/busca?q=saude`, `/documento/1194` e `/sobre`.
  A busca exibiu 508 documentos, 7.230 empenhos e quatro credores na amostra,
  com links de detalhe e origem oficial no documento. Não é auditoria de
  todos os resultados, filtros e critérios de ranking.
- #218 encerrado após integração pelo #225; #132 teve a correção de ISR e
  as medições históricas preservadas e foi encerrado. #199 integrado por
  #226, commit `4eccbeb`, com CI aprovado antes do merge.
- Private vulnerability reporting: configuração relida como `enabled=true`.
  Contato público autorizado: `henriqueogs@gmail.com`.

## Restauração isolada do backup

Snapshot confirmado em **04/11/2026 06:00:38 UTC**. Download comprimido de
423.267.666 bytes; SQLite restaurado com 2.938.384.384 bytes. O procedimento
oficial `restoreDailySnapshot` validou checksum, tamanho e `integrity_check`
antes de criar a cópia isolada. Nenhuma substituição da base ativa.

O primeiro relatório de contagens usou um nome de tabela inexistente
(`transparencia_empenhos`); a restauração já havia terminado. Corrigido o
relatório para `transparencia_despesas` e feita nova leitura da cópia. Em
**05/11/2026 02:05:08 UTC**, o hash lógico recomputado coincidiu com o
manifesto. Evidência detalhada preservada no diretório isolado da VM.

| Tabela | Registros na cópia |
|---|---:|
| documentos | 2.348 |
| documentos_resumos_ai | 3.318 |
| licitacoes_produtos | 13.158 |
| transparencia_despesas | 31.255 |
| transparencia_folha | 25.969 |
| alertas | 306 |

Estas contagens pertencem ao snapshot. Não provam igualdade com uma base
ativa que continuou recebendo processamento depois das 06h UTC. O teste
comprova a recuperação desse snapshot, não uma política completa de RTO/RPO.

## Experimentos de modelo — resultados rejeitados

Sem alterar o modelo global, o provider Ultra excedeu 30 s num prompt
mínimo e 120 s nos três documentos, mesmo com raciocínio desativado. Modelos
antigos responderam 410/404, confirmando que catálogo não equivale a acesso.

Lightning respondeu ao teste mínimo em aproximadamente três segundos.
Com raciocínio padrão, os documentos terminaram em timeout ou conteúdo vazio.
Com raciocínio desativado, gerou JSON válido para 992, 1566 e 1860 em
aproximadamente 15, 9 e 30 segundos. **Os três resultados foram rejeitados**:
trechos não literais, confusão entre suplementação e financiamento por
anulação, atribuição incorreta de autoridade, moeda histórica tratada como
BRL e nome de município distorcido. Contrato válido não é evidência factual.
Nenhum candidato foi gravado no banco oficial. Não há recomendação de troca
global de modelo com esta amostra.

Em 02:06:28 UTC, os três resumos continuavam pendentes e sem resultado atual;
cinco tarefas de itens seguiam com timeout e 490 tarefas aguardavam revisão.

## Fiscal de datas e proveniência — escopo da correção de apresentação

Auditoria direta dos arquivos alterados e da amostra navegada, sem afirmar
uma auditoria independente de todo o sistema. A consulta pública à IA está
estacionada; não foram realizadas cinco perguntas nem habilitado o RAG.

| Regra | Antes | Correção / verificação |
|---|---|---|
| D5/P3: data do ato, nunca processamento | FAIL: cabeçalho 1194 usava `atualizado_em` sem publicação | `DocumentHeader` passa somente o documento a `publicationLabel`; ausência fica explícita |
| D9: fronteira de fuso | Risco no parse local de YYYY-MM-DD | Testes de 31/12, 01/01, ano bissexto e data impossível; formatação civil sem fuso local |
| D2/D3: soma e período | FAIL: Sobre mostrava soma monetária histórica sem período | Removida a soma sem recorte; caminhos por processo/período e estágios explícitos |
| P1/P2: origem | Documento 1194 possui arquivo e página oficial | Links preservados; correção não altera resolução de fonte |
| P4/P5: evidência/IA | Sobre afirmava rastreabilidade de todos os números de IA | Texto passa a pedir conferência dos trechos e reconhecer erros; fontes e disclaimer preservados |

VEREDITO DO ESCOPO: PASS na revisão de código e nos três testes de datas;
aceite final de apresentação depende do build, CI e nova visita em produção.
