---
name: fiscal-privacidade-linguagem
description: Protocolo para auditar privacidade (LGPD) e linguagem não acusatória no Monitor Ritápolis. Use ao criar/alterar folha, credores pessoa física, alertas/Na Lupa, descobertas, prompts de IA, índice vetorial/RAG, textos de resposta e qualquer saída que cite pessoas ou levante suspeita.
---

# Fiscal de Privacidade e Linguagem

Objetivo: transparência sem expor indevidamente pessoas e sem acusar sem prova. A plataforma
mostra **fatos e indícios com fonte**; nunca veredito de culpa.

## Privacidade (LGPD / LAI)
- **L1 Mínimo necessário.** Publicar o que a LAI exige (nome do servidor, cargo, remuneração, vínculo). **Nunca** CPF completo, endereço, telefone pessoal, data de nascimento, dados bancários, e-mail pessoal. CPF mascarado quando indispensável.
- **L2 Pessoa física ≠ jurídica.** Credor PF recebe tratamento distinto (sem perfil/dossiê que facilite perseguição); decisão documentada.
- **L3 Índice de IA.** O que entra no índice vetorial/contexto de LLM passa pelo mesmo filtro: PF e campos sensíveis excluídos ou mascarados *antes* de chunk/embedding; provider externo não recebe dado que a tela não mostraria.
- **L4 Logs e traces.** Sem dado pessoal em logs, traces de IA e relatórios de erro.
- **L5 Canal de correção.** Existe forma visível de reportar erro/pedir retificação.

## Linguagem (não acusatória)
- **N1 Fato + fonte + critério.** "Foram empenhados R$ X ao credor Y em AAAA (fonte)", não "desvio", "fraude", "corrupção", "superfaturamento" sem decisão oficial citada.
- **N2 Alerta é indício.** Textos de alerta/descoberta dizem "merece verificação", explicam o critério estatístico e o limite; nunca atribuem intenção.
- **N3 Comparação justa.** Comparar só o comparável (mesma grandeza, período e porte); senão não comparar (ver `fiscal-valores`, `fiscal-datas-mandato`).
- **N4 Prompts.** Prompts de IA proíbem acusar, especular motivação ou inferir culpa; saída estruturada inclui `limitacoes`.
- **N5 Neutralidade.** Sem adjetivação política; mesmo critério para todos os mandatos e gestores.

## Procedimento
1. Delimite o escopo; liste campos pessoais expostos, prompts, templates de texto e fontes do índice de IA.
2. Aplique L1–L5 e N1–N5; para textos gerados, amostre 10 saídas reais e procure termos acusatórios (`grep -inE "fraude|desvio|corrup|superfatur|ilegal|criminos"`).
3. Teste esperado: fixture com PF/CPF → saída mascarada/ausente; texto-fonte com termo acusatório → saída neutra.

## Saída obrigatória
```
VEREDITO: PASS | FAIL
| # | Regra | Sev | arquivo:linha | Problema | Correção |
```
Reporte, não corrija. Bloqueia merge: L1, L3, N1, N2.
