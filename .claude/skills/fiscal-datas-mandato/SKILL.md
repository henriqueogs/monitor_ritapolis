---
name: fiscal-datas-mandato
description: Protocolo rígido para auditar datas, exercícios e mandatos no Monitor Ritápolis. Use ao criar/alterar qualquer agregação, série temporal, filtro por ano/mandato, tela de pagamentos, diárias, folha, contratos ou "recentes", e ao revisar diffs que tocam períodos. Garante que nada de um mandato/ano contamine outro e que o destaque seja sempre o mandato/ano corrente, não o acumulado de vida.
---

# Fiscal de Datas e Mandatos

Objetivo: **nunca** exibir dado com período errado, ambíguo ou misturado entre mandatos.
Princípio de produto: o que importa ao cidadão é *o que acontece no mandato/ano*. Totais
históricos existem só como **somador secundário**, rotulado com o intervalo.

## Fonte única de verdade
`src/utils/mandato.js` (`mandatoInicio`, `mandatoLabel`, `agruparPorMandato`; ref. 2025, 4 anos:
2017–2020 · 2021–2024 · 2025–2028). **Proibido** redefinir mandato/ano fora dali.
Já conhecido: `resolverExercicios`/`montarPeriodo` estão duplicados em
`src/transparencia/gastos-service.js` e `finalidade-service.js` → candidato a extração.

## Regras (cada uma é verificável)
- **D1 Fonte única.** Nenhum cálculo de mandato fora de `utils/mandato.js` (grep `% 4`, `+ 3`, `2025`, `2021`).
- **D2 Período sempre explícito.** Toda soma/contagem carrega `exercicio` ou `mandato` no payload *e* no rótulo da UI (CLAUDE.md §11.1).
- **D3 Destaque = período corrente.** Valor principal na tela é do ano/mandato selecionado (padrão: mandato em curso). Acumulado de vários mandatos só como campo `acumulado_*` secundário, com rótulo "(AAAA–AAAA)". Nunca o número maior em destaque.
- **D4 Granularidade natural.** Folha/salário → **mensal** (competência mês/ano), nunca soma de vida. Diárias → por ano/mandato, nunca 20 anos. Contratos → por vigência *e* por pagamento no exercício.
- **D5 Qual data?** Cada métrica declara a data usada: competência, empenho, liquidação, pagamento, assinatura, publicação. Misturar datas na mesma soma é proibido.
- **D6 Fronteira de mandato.** Item que cruza mandatos (contrato plurianual, restos a pagar) é atribuído por **evento datado** (pagamento no exercício), nunca ao mandato da assinatura inteiro.
- **D7 Mandato parcial/em curso.** Rotular (`em_curso`, anos realmente presentes em `anos[]`). Comparar mandato em curso com mandato completo exige aviso explícito.
- **D8 Mandato ≠ gestor.** Período e pessoa são entidades separadas (prevê reeleição). Nunca inferir o gestor pelo período; reservar `gestor_id` independente de `mandato`.
- **D9 Validade.** Rejeitar/sinalizar: ano fora de `ANO_PLAUSIVEL`, data futura, `data_publicacao` anterior à data do ato sem justificativa, datas parseadas com `new Date('YYYY-MM-DD')` (desvio de fuso → usar `utils/datas.js`).
- **D10 "Recente".** = `COALESCE(data_publicacao, data_abertura) DESC`; nunca `coletado_em`/`atualizado_em` (§11.2).
- **D11 Câmara.** Legislatura segue o mesmo ciclo; vereador/mandato não herda dado do mandato anterior.

## Procedimento
1. Delimite o escopo (diff, arquivo ou área). Liste endpoints, serviços, SQL e telas que exibem período.
2. Busque: `grep -rnE "SUM\(|agruparPorMandato|resolverExercicios|exercicio|mandato|coletado_em|new Date\(" <escopo>`; nas telas, rótulos "Total", "Valor", "R$".
3. Para cada ocorrência aplique D1–D11 e registre PASS/FAIL com `arquivo:linha`.
4. Verifique que existe **teste** cobrindo a fronteira (ex.: 2024-12 vs 2025-01, mandato parcial, contrato plurianual). Sem teste = FAIL.
5. Confira exemplos concretos nos dados (consulta somente leitura) quando houver dúvida.

## Saída obrigatória
```
VEREDITO: PASS | FAIL
| # | Regra | Sev (bloqueia/alerta) | arquivo:linha | Problema | Correção proposta |
Testes de fronteira faltando: ...
```
Não corrija código por conta própria; reporte. Bloqueia merge: D1, D2, D3, D6.
