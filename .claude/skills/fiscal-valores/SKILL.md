---
name: fiscal-valores
description: Protocolo rígido para aferir valores monetários no Monitor Ritápolis — impede duplicidade, soma entre mandatos/períodos, mistura de estágios (empenhado/liquidado/pago/estimado) e valores sem origem. Use ao criar/alterar SQL com SUM, agregados, joins, dossiês de credor, painéis, cards, rankings, valores extraídos por IA ou respostas de IA com números.
---

# Fiscal de Valores

Objetivo: **nenhum número na tela que não corresponda à realidade.** Se não dá para provar,
não exibe. Complementa o `fiscal-datas-mandato` (que cuida do *quando*); este cuida do *quanto*.

Exemplo-guia: empresa recebeu R$ 1.000 em 2000 e R$ 1.000 em 2025 → **nunca** destacar
"R$ 2.000". Exibir R$ 1.000 por mandato; acumulado só como somador secundário rotulado.

## Regras (cada uma verificável)
- **V1 Sem soma entre períodos distintos como destaque.** Totais agregam dentro de *um* exercício/mandato. Acumulado multi-mandato: campo secundário, rótulo com intervalo (§11.1).
- **V2 Grandeza explícita.** Rótulo e campo dizem qual: *estimado* (licitação) · *contratado* · *empenhado* · *liquidado* · *pago*. São grandezas diferentes: **nunca somadas entre si nem chamadas só de "valor"**. Empenho→liquidação→pagamento são estágios do *mesmo* gasto.
- **V3 Dupla contagem.** Checar sempre:
  - JOIN 1:N (itens, anexos, vínculos) seguido de `SUM` sem `DISTINCT`/subquery;
  - mesmo empenho vindo de duas fontes (API do portal e fluxo thread/CSV) ou recoletado;
  - documento duplicado/reprocessado (ver `merge-duplicatas`, `documento-merge`);
  - aditivos somados duas vezes ao valor original; estornos/anulações (negativos) ignorados;
  - totais de grupo + totais de itens exibidos juntos.
- **V4 Identidade do credor.** Agrupar por chave canônica (`transparencia/credor-chave`), nunca por nome livre; matriz/filial e PF vs PJ tratados explicitamente; homônimos não se fundem.
- **V5 Escala e parse.** Reais vs centavos, formato pt-BR (`1.234,56`), `NaN`/nulos tratados como 0 só quando documentado; ordem de grandeza plausível (outlier → sinalizar, não exibir calado).
- **V6 Valor de IA só com gate.** Valor extraído por LLM só aparece após o gate existente (`scripts/validar-valores-licitacoes.js`, `aplicar-gate-valores*.js`). Resposta de IA com número deve vir de ferramenta tipada (ADR 0004), não do texto do modelo.
- **V7 Reconciliação (invariantes testáveis).** Para cada agregado exibido: `Σ detalhes == total` no mesmo período; `Σ por_ano == total_mandato`; contagem de linhas igual entre lista e total; total da API coerente com a fonte oficial (`transparencia/portal-links`).
- **V8 Proveniência.** Todo valor exibido leva a uma origem rastreável (§11.3; ver `fiscal-proveniencia`).
- **V9 Nada de "valor da vida".** Salário → mensal; diárias → por ano; nada acumulado de décadas em destaque.

## Procedimento
1. Delimite o escopo; liste toda query com `SUM(`/`COUNT(`/`AVG(`, todo serviço que agrega e todo componente que formata R$.
2. Por número exibido, preencha a **ficha**: grandeza · período · fonte · estágio · chave de agrupamento · como evita duplicar · invariante que o prova.
3. Aplique V1–V9; procure duplicidade de fato rodando a consulta (somente leitura) e comparando com contagem distinta.
4. Exija teste de invariante (SQLite `:memory:`) para cada agregado novo: fixture com duplicata, estorno, dois mandatos e credor homônimo.
5. Sem ficha completa ou sem teste de invariante = FAIL.

## Saída obrigatória
```
VEREDITO: PASS | FAIL
Fichas: | número exibido | grandeza | período | fonte | dedup | invariante |
| # | Regra | Sev | arquivo:linha | Problema | Evidência (consulta/valores) | Correção |
```
Não corrija por conta própria; reporte. Bloqueia merge: V1, V2, V3, V6, V7.
