# Na Lupa v4 — N0: diagnóstico (29/10/2026)

Leitura somente (SSH na VM, banco aberto `readOnly`). Nenhum credor ou pessoa é
citado de propósito: **o repositório é público** e as contagens abaixo são
heurísticas exploratórias, não achados verificados.

## 1. Estado atual da Na Lupa

306 alertas: **1 publicado** (#57, árvores), 81 rejeitados, **224 em revisão**.

| Em revisão | Qtde |
|---|---|
| "Riscos sinalizados pela IA" (alto) | 207 |
| Eventos públicos | 7 |
| Educação / Equipamentos / Obras / Contratos recorrentes / Cultura | 10 |

Motivos de retenção (gate): `EDITORIAL_GENERIC_TITLE` em ~204 dos 224;
`EDITORIAL_NUMBER_NOT_GROUNDED` em 55 (número que a IA citou e o sistema não
confirmou); `CONFIDENCE_BELOW_MIN` em 76; `EDITORIAL_CONTRADICTS_FACTS` em 6.

**Leitura:** a IA *já levanta suspeitas* (207 "riscos"), mas em título genérico e
às vezes com número não ancorado — por isso nada passa. O problema não é falta de
suspeita; é falta de **unidade de análise** (dossiê) e de **evidência verificada**.
Isso confirma o desenho da trilha 2 (Analista IA com verificador de evidências).

## 2. Dados disponíveis

- `transparencia_despesas`: 31.224 linhas (2017–2026); EO 27.600, EG 2.115,
  EE 1.276, OP 233. `credor_chave` e `historico` sempre preenchidos.
- **`licitacao_ref`/`modalidade` quase vazios (≈70–77 linhas):** do empenho
  sozinho **não dá para afirmar "sem licitação"**. Precisa cruzar com
  documentos (contrato, ata, edital) — o vínculo real existe (68,7% medido),
  mas fora dessas colunas.
- `licitacoes_produtos`: 13.157 itens; 8.043 com valor final.
- **Qualidade de `unidade` (bloqueia comparação de preço):** 4.776 itens (36%)
  com a **string `"undefined"`**, 3.003 nulos e lixo como `|`, `| BDI 1`.
  Só ~⅓ tem unidade utilizável. Origem do `"undefined"` não rastreada
  (parser determinístico retorna `null`; suspeita é a rota `ia_resumo`).

## 3. Vertente 1 — compras repetidas (amostra exploratória)

Critério de teste: mesmo credor PJ + mesmo objeto normalizado (histórico),
≥ 4 empenhos originais em janela de 90 dias.

| Etapa | Resultado |
|---|---|
| Candidatos brutos | 459 |
| Após excluir folha/INSS/previdência/tributos/energia/água | 237 (−222: ~48% era ruído legítimo) |
| Com ≥ 4 datas de empenho distintas | 141 |
| Soma ≥ limite e cada empenho abaixo (padrão de fracionamento) | 31 |
| Credores distintos entre os candidatos | 85 |

O que a amostra mostra:

- Padrões **legítimos** dominam o topo: requisições repetidas de peças, pneus,
  combustível, repasses a entidades e consórcios — normais sob **ata de registro
  de preços ou contrato**. O empenho repetido, sozinho, **não prova**
  fracionamento.
- Para virar achado, a vertente precisa responder, com documento: *existe
  contrato/ata cobrindo o objeto e o período?* Se existe → recorrência esperada
  (não é descoberta); se não aparece no acervo → **lacuna** ("não localizamos
  instrumento no acervo"), que é fato verificável e redigível sem acusar.
- Limite de dispensa por ano **não pode ser fixo no código**: vai em
  configuração por ano (valores atualizados por decreto).
- Pessoa física (auxílio saúde, bolsas) deve ficar **fora** por construção
  (LGPD); só PJ e agregados.

## 4. Preço acima da referência (vertente 2)

11 itens com ≥ 3 documentos e preço unitário máximo ≥ 3× o mínimo — mas **sem
unidade confiável** (seção 2) não se sabe se é a mesma coisa (caixa × unidade).
**Bloqueada** até normalizar unidade; candidata a trabalho de dados antes da
vertente.

## 5. Conclusões e ajustes ao plano

1. **Vertente 1 viável, com cruzamento documental obrigatório** (empenhos ×
   contratos/atas × `licitacoes_detalhes`). Entrega: "recorrência sem
   instrumento localizado" + soma por janela, com empenhos citados.
2. **Trilha 2 prioritária**: já há 207 suspeitas genéricas; o ganho está em
   dossiê + verificador de evidências, não em gerar mais texto.
3. **Pré-requisito de dados (novo):** corrigir/normalizar `unidade` (e achar a
   origem do `"undefined"`) antes das vertentes de preço (2) e de quantidades (6).
4. **Reaproveitar** a tela de revisão do admin (já tem evidências e
   revalidação) como fila interna das "Suspeitas da IA".
5. **Backlog de qualidade herdado:** 224 em revisão — decidir em lote (rejeitar
   o genérico, reprocessar o resto pelo dossiê novo) em vez de revisar um a um.

## 6. Próximo passo (N1)

Contrato de vertente + orquestrador + ocultar legado, e em paralelo duas tarefas
pequenas e independentes:

- **D1:** rastrear e corrigir `unidade = "undefined"` (TDD no ponto de gravação)
  e normalizar unidades.
- **D2:** configuração anual do limite de dispensa + exclusões (folha, tributos,
  concessionárias) como lista nomeada em `src/alertas/`.
