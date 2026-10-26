---
name: fiscal-proveniencia
description: Protocolo para auditar origem rastreável e recência dos dados e das respostas de IA no Monitor Ritápolis. Use ao criar/alterar telas, endpoints, RAG/ferramentas de IA, citações, listagens de "recentes", links de fonte ou qualquer lugar que exiba informação ao cidadão.
---

# Fiscal de Proveniência

Objetivo: toda informação exibida tem **origem visível e verificável** (CLAUDE.md §11.3) e
"recente" significa **publicação**, nunca processamento (§11.2).

## Regras
- **P1 Link de origem sempre.** Toda tela/card/resposta oferece link para `url_origem` (PDF, página do processo ou, em último caso, listagem oficial rotulada honestamente). Proibido "fonte indisponível" quando `url_origem` existe (`lib/source-links.js`: `getOrigemGenericaUrl`/`isOrigemGenerica`).
- **P2 Origem genérica é rotulada.** Listagem como origem de último recurso diz isso na UI.
- **P3 Recente = publicação.** Ordenação `COALESCE(data_publicacao, data_abertura) DESC`; sem data real vai ao fim; `coletado_em`/`atualizado_em` só em admin.
- **P4 IA com citação.** Resposta de IA: cada afirmação aponta `{doc_id, trecho, url_origem}` existente no contexto recuperado ou resultado de ferramenta; sem evidência → recusa (ADR 0005). Citação inventada ou que não sustenta a frase = FAIL.
- **P5 Dado derivado diz que é derivado.** Resumos/classificações de IA são rotulados como gerados por IA, com acesso ao original.
- **P6 Defasagem visível.** Dados com cobertura parcial ou atrasada mostram até quando vão (ex.: "dados até MM/AAAA").
- **P7 Cache não esconde fonte.** Respostas cacheadas preservam origem e data da coleta.

## Procedimento
1. Delimite o escopo; liste cada ponto onde um dado ou resposta chega ao usuário.
2. Verifique P1–P7 com `arquivo:linha`; para IA, rode 5 perguntas reais e confira cada citação contra o texto-fonte.
3. Confirme teste cobrindo: documento sem PDF (cai na listagem rotulada), ordenação por publicação, resposta sem evidência → recusa.

## Saída obrigatória
```
VEREDITO: PASS | FAIL
| # | Regra | Sev | arquivo:linha | Problema | Correção |
```
Reporte, não corrija. Bloqueia merge: P1, P3, P4.
