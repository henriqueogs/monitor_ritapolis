# Leitura integral e evidencia de itens de licitacao

## Mudanca

`itens-processo-v1.1-full` substitui o corte de 60 mil caracteres e cinco atas
por leitura de todos os textos oficiais anexados ao processo. Prompts de ate
10 mil caracteres, com sobreposicao e fronteiras de linha quando disponiveis,
avancam em sequencia na fila existente. Nao existe outra fila, scheduler ou
backup. Anexo sem texto impede declarar cobertura integral.

Cada trecho validado tem checkpoint SQLite vinculado ao manifesto das fontes,
faixa original de caracteres e versao da operacao. JSON incompleto, excesso
de linhas ou timeout permitem subdivisao persistida: a retomada reutiliza as
folhas validas, nao repete a chamada grande que falhou. O limite por resposta
nao limita o total final a 200 linhas. Saida final acima do limite de seguranca
de 20 mil linhas exige revisao, nunca corte silencioso.

Descricao, identificadores, nome, CNPJ, quantidade e valores precisam constar
na citacao literal da propria linha. Desconhecido continua null. Nenhum valor
e calculado ou associado por nome semelhante. Contradicoes de identidade ou
de resultado global exigem revisao; nao se escolhe a linha mais rica.
Duplicatas exatas na mesma fonte, inclusive sobreposicao de trechos, sao
colapsadas. Numeros iguais de item/lote em fontes diferentes nao autorizam
unir fornecedores ou valores.

## Publicacao e identidade

A projeção publica verifica hash atual, cobertura, citacao e origem. Resultado
antigo curto so e reutilizado quando todas essas verificacoes aplicaveis
passam. Fonte alterada durante uma chamada impede a persistencia da saida.
URL/identidade alterada invalida o checkpoint e cria uma identidade nova de
trabalho, mesmo se o texto for igual. Gravacao identica nao altera timestamp.

Resultado nao comprovado permanece armazenado para auditoria, mas o read-model
nao volta a uma heuristica e nao declara ausencia de itens. A interface informa
verificacao pendente; linhas verificadas oferecem citacao e URL da fonte
especifica, nao o edital por padrao quando o dado veio de anexo.

## Evidencia e limites

Inventario somente leitura de 01/10/2026, 19:11:38 UTC, em producao:

- 533 ultimas saidas antigas, 17 reutilizaveis sob a verificacao nova;
- 516 exigem verificacao (mudanca/ampliacao de fontes, cobertura ou evidencia);
- 91 processos tem ao menos uma fonte anexada sem texto;
- planejamento sobre processo 125: 195276 caracteres, tres fontes, 26 prompts,
  cobertura de faixas sem buracos;
- processo 2433: 72523 caracteres, oito prompts; processo 2440: 11514, dois;
- processo 343 bloqueado por anexo sem texto, sem fingir leitura completa.

O inventario nao prova que 516 resultados estejam factualmente errados. A
checagem recusa comprovacao insuficiente. Testes cobrem fonte de 1,1 milhao de
caracteres, setimo anexo, 350/420 linhas, JSON truncado, retomada SQLite,
contradicoes e rejeicao de pessoa/valor/citacao ausentes na fonte.

Faixas cobertas provam que todos os caracteres entraram em prompts validados;
nao provam que o modelo reconheceu todas as linhas de toda tabela nem que o OCR
preservou todas as palavras. A citacao e a comparacao com a fonte original
continuam obrigatorias. O piloto de planejamento nao fez chamadas de IA nem
gravacoes canonicas. A qualidade da extracao real e do agrupamento de lotes
deve ser observada nos trabalhos afetados, sem reimportacao global e sem
aumentar limites diarios ou concorrencia. Resumos/leitura integrada tem suas
proprias etapas e ainda precisam de verificacao independente.
