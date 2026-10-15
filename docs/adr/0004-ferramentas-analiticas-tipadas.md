# ADR 0004 — Ferramentas analíticas tipadas, não text-to-SQL

**Status:** proposto

## Contexto
Perguntas sobre valores ("quanto foi pago a X em 2024?") exigem agregação exata. Text-to-SQL
livre é impreciso, difícil de auditar e abre superfície de segurança. Além disso a regra de
produto §11.1 exige que toda soma carregue o intervalo de tempo.

## Decisão
Camada semântica: funções tipadas e **somente leitura** sobre os repositórios
(`gastoPorCredor({credor, anoInicio, anoFim})`, `licitacoesPorFiltro(...)`…), cada uma com
JSON Schema de entrada. O LLM escolhe ferramenta e parâmetros; o SQL é nosso. Parâmetros de
período são obrigatórios nas que somam valores. Máximo de passos e de chamadas por pergunta.

## Consequências
+ Resultado determinístico, testável, auditável; §11.1 garantida por construção.
− Cobertura limitada ao catálogo de ferramentas; novas perguntas = novas ferramentas (Fase 2).
