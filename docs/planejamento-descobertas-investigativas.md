# Planejamento: Descobertas investigativas precisas

**Status:** aprovado para implementação  
**Data da análise:** 15/07/2026  
**Área:** Na Lupa, pipeline de inteligência e ordenação da home

## 1. Resumo executivo

O módulo de Descobertas deve deixar de publicar agregações anuais genéricas e passar a publicar somente afirmações específicas, verificáveis e úteis ao cidadão. A Descoberta 57, sobre a supressão de 70 árvores em dois processos, será a referência de qualidade. A Descoberta 132, que mistura objetos diferentes sob o rótulo de “serviços recorrentes”, será a referência negativa.

O fluxo continuará automático, mas a publicação será separada da geração. Um candidato só ficará público depois de passar por um gate factual determinístico, receber uma narrativa baseada exclusivamente nas evidências aprovadas e passar por um gate editorial. Casos incompletos ou ambíguos irão para revisão e permanecerão fora das APIs públicas.

Também será criada uma consulta exclusiva para “Publicado recentemente” na home. Ela aceitará somente documentos com `data_publicacao` válida e os ordenará pela data de publicação, do mais recente para o mais antigo.

## 2. Diagnóstico confirmado

Snapshot da base em 15/07/2026:

- 80 Descobertas com `status = ativo` aparecem nas APIs públicas.
- 49 pertencem ao modelo legado e são, em sua maioria, agregações amplas por categoria e ano.
- 31 usam a investigação `discovery_v2`: 22 estão `ok` e 9 em `limite_ciclo`.
- Os 9 itens `limite_ciclo` aparecem publicamente porque o filtro público verifica apenas `alertas.status = ativo`.
- 20 investigações novas são cestos anuais de “serviços recorrentes” ou “eventos públicos”. Todas usam evidências repetidas e genéricas.
- 10 investigações de preços têm fatos individualizados, mas o comparativo anual mistura produtos e unidades que podem não ser equivalentes.
- Apenas a Descoberta 57 já apresenta claramente um ponto fixo, cálculo reproduzível, fontes delimitadas e conclusão útil.

### 2.1 Por que a Descoberta 57 funciona

- O objeto é único: supressão de árvores.
- A contagem é reproduzível: 60 árvores no documento 607 mais 10 no documento 12.
- O período e a unidade estão explícitos.
- A narrativa conecta fato, contexto e lacuna documental.
- Cada evidência aponta para um documento ou anexo oficial.
- As perguntas abertas são consequência direta do caso analisado.

### 2.2 Por que a Descoberta 132 falha

- “Recorrência” é inferida pela presença de expressões genéricas como “contratação de empresa”, “prestação de serviços”, “locação” ou “manutenção”.
- O número 113 conta ocorrências de documento/anexo, mas é apresentado como quantidade de documentos.
- Os objetos vinculados não formam um grupo coerente: há ornamentação, rodeio, reforma de UBS, compra de van, filmagem e concessão de espaço.
- Não há fornecedor, CNPJ ou objeto comum demonstrando recorrência.
- As evidências repetem apenas `servico recorrente`, sem explicar o que se repete.
- A IA recebe uma premissa fraca e apenas a transforma em prosa convincente.

## 3. Decisões de produto

1. **Ocultação imediata:** uma Descoberta que não passar no novo gate deixa de aparecer publicamente, mas seus dados são preservados para auditoria e reprocessamento.
2. **Publicação automática com gate:** candidatos aprovados factual e editorialmente são publicados sem revisão humana. Exceções vão para a fila administrativa.
3. **Sem bypass factual:** o admin pode aprovar uma narrativa sinalizada para revisão editorial, mas não pode publicar um candidato que falhou em coerência factual.
4. **Uma Descoberta, uma afirmação:** cada publicação deve tratar de um objeto, evento, fornecedor, produto, processo ou fato agregado claramente delimitado.
5. **IA não determina o fato:** agrupamentos, cálculos, métricas e comparativos são produzidos e validados antes da chamada ao modelo.
6. **Métricas determinísticas são imutáveis:** a resposta da IA não pode apagar ou substituir métricas e comparativos calculados pelo sistema.
7. **Home por publicação real:** documentos sem `data_publicacao` válida permanecem no acervo, mas não aparecem em “Publicado recentemente”.

## 4. Modelo de publicação

### 4.1 Estado editorial

Adicionar às Descobertas um estado editorial separado do `status` de moderação existente:

| Estado | Significado | Público |
| --- | --- | --- |
| `candidato` | Detectado ou alterado; aguarda validação | Não |
| `evidencias_prontas` | Pacote factual passou no primeiro gate | Não |
| `analisado` | Narrativa foi gerada e validada | Não |
| `revisao` | Exige correção de dados ou decisão editorial | Não |
| `publicado` | Passou por todos os gates | Sim |
| `rejeitado` | Rejeição humana ou substituição definitiva | Não |

Persistir em `alertas`:

- `estado_editorial TEXT NOT NULL DEFAULT 'candidato'`;
- `evidencias_hash TEXT` para idempotência e reabertura por mudança de fonte;
- `qualidade_motivos_json TEXT NOT NULL DEFAULT '[]'`;
- `qualidade_versao TEXT`;
- `publicado_em TEXT`.

Criar também `alertas_editorial_historico` com `id`, `alerta_id`, `estado_anterior`, `estado_novo`, `origem`, `motivos_json`, `evidencias_hash` e `criado_em`. Toda transição será append-only; reprocessamentos não apagarão decisões ou diagnósticos anteriores.

O `status` atual (`ativo`, `arquivado`, `suprimido`) continuará representando moderação. Uma Descoberta pública deverá satisfazer simultaneamente:

```text
status = ativo AND estado_editorial = publicado
```

### 4.2 Contrato `discovery_v3`

O novo contrato será dividido para impedir que texto gerado altere fatos:

```json
{
  "contrato_versao": "discovery-v3",
  "tipo_investigacao": "tipo.estavel",
  "subject_key": "identidade-estavel-do-caso",
  "evidencias_hash": "sha256",
  "fato": {
    "metrica_principal": { "nome": "...", "valor": 0, "unidade": "..." },
    "metricas": {},
    "comparativos": {},
    "periodo": { "inicio": "YYYY-MM-DD", "fim": "YYYY-MM-DD" },
    "documentos_ids": [],
    "evidencias": []
  },
  "editorial": {
    "pergunta_cidada": "...",
    "resposta_direta": "...",
    "por_que_olhar": "...",
    "narrativa_consolidada": "...",
    "perguntas_abertas": [],
    "limites_publicacao": []
  },
  "qualidade": {
    "status": "aprovado",
    "motivos": [],
    "verificado_em": "ISO-8601"
  },
  "geracao": { "provider": "...", "modelo": "...", "gerado_em": "ISO-8601" }
}
```

As APIs públicas manterão os campos de compatibilidade `titulo`, `narrativa`, `valor_total`, `valor_periodo_label` e `documentos_ids`, mas passarão a expor também `pergunta_cidada`, `resposta_direta`, `por_que_olhar`, `metricas` e `comparativos` a partir do `discovery_v3`. `discovery_v2` ficará disponível somente no admin durante a migração.

## 5. Pipeline proposto

```text
coleta e OCR
    -> extração de fatos
    -> formação de grupos específicos
    -> gate factual
    -> geração da narrativa
    -> gate editorial
    -> publicação
```

O worker incremental existente será mantido, mas passará a operar por estado editorial e `evidencias_hash`:

1. Detectar candidatos novos ou cujo conjunto de evidências mudou.
2. Calcular `subject_key`, métricas, comparativos e documentos distintos.
3. Executar o gate factual sem IA.
4. Se aprovado, gerar a narrativa com o modelo de investigação.
5. Validar a narrativa contra o pacote factual permitido.
6. Publicar automaticamente ou encaminhar para revisão.
7. Registrar watermark, duração, resultado e motivos de reprovação.

O worker continuará usando lotes pequenos e atraso configurável. Falha do provedor mantém o item em `candidato`, registra `AI_PROVIDER_ERROR` e permite retentativa; nunca publica fallback genérico.

Adicionar `npm run descobertas:processar` como entrada canônica, com `--limite=N`, `--delay-ms=N`, `--id=ID`, `--force` e `--dry-run`. O comando atual `descobertas:investigar` ficará como alias durante a migração. O endpoint `POST /api/admin/trigger/descobertas-ia-cycle` será preservado e passará a chamar o novo fluxo completo.

## 6. Regras dos detectores

### 6.1 Supressão de árvores e outros fatos quantitativos

- Agrupar por subtipo factual, ano e unidade.
- Deduplicar o mesmo fato extraído do documento principal e de anexos equivalentes.
- Somar somente quantidades explicitamente vinculadas a trechos oficiais.
- Publicar quando o objeto e a unidade forem inequívocos e o cálculo puder ser refeito pelas evidências.
- Usar a Descoberta 57 como fixture positiva de regressão.

### 6.2 Recorrência de fornecedor e objeto

- O uso de palavras como “serviço”, “contratação” ou “locação” não constitui recorrência.
- Auto-publicação exige pelo menos dois processos distintos com o mesmo CNPJ e objetos pertencentes ao mesmo grupo normalizado.
- A normalização do objeto removerá acentos, stopwords administrativas, número do processo, modalidade, datas e pontuação; a similaridade será calculada por tokens, com limiar mínimo de 0,75.
- Sem CNPJ, um grupo com objeto equivalente em pelo menos três processos pode ir para `revisao`, mas não será publicado automaticamente.
- A descoberta deverá apresentar fornecedor, CNPJ, processos, quantidade de ocorrências, período e diferenças relevantes entre os objetos.
- Cada evidência terá descrição específica; `servico recorrente` isolado será inválido.

### 6.3 Contratações ligadas a eventos

- Agrupar por evento identificado e ano, nunca apenas por ano.
- Exigir uma `event_key` estável derivada do nome do evento, como `42-exposicao-agropecuaria-2026`.
- Se não houver nome de evento verificável, o candidato não será público.
- A descoberta deverá consolidar os processos ligados ao mesmo evento, objetos contratados, fornecedores e valores disponíveis.
- A ausência de valor poderá ser informada como lacuna, desde que a quantidade de processos e a relação com o evento sejam comprovadas.

### 6.4 Preços e itens fora da curva

- Comparar somente itens com a mesma descrição normalizada e mesma unidade de medida.
- Exigir no mínimo três observações válidas em documentos distintos para formar o grupo comparável.
- Usar valor unitário final quando disponível; caso contrário, valor unitário estimado identificado como tal.
- Um item será candidato quando for pelo menos quatro vezes a mediana do grupo e a diferença absoluta for igual ou superior a R$ 1.000.
- Item sem unidade, quantidade ou descrição suficiente será encaminhado para qualidade de dados, não para publicação automática como anomalia de preço.
- A publicação mostrará item, unidade, valor-alvo, mediana, tamanho da amostra, período e documentos comparados.

## 7. Gate de qualidade

### 7.1 Gate factual obrigatório

O candidato será reprovado quando ocorrer qualquer condição abaixo:

- `NO_FIXED_SUBJECT`: não existe objeto, evento, fornecedor, produto ou fato delimitado.
- `GENERIC_EVIDENCE`: evidências possuem apenas rótulos genéricos.
- `DOCUMENT_COUNT_MISMATCH`: a contagem publicada diverge dos documentos distintos.
- `MIXED_SUBJECTS`: objetos desconexos foram combinados.
- `RECURRENCE_NOT_PROVEN`: recorrência sem fornecedor/objeto repetido comprovado.
- `COMPARISON_NOT_COMPARABLE`: comparação entre produtos, unidades ou períodos incompatíveis.
- `METRIC_NOT_REPRODUCIBLE`: métrica não pode ser recalculada pelas evidências.
- `SOURCE_NOT_TRACEABLE`: documento ou anexo sem vínculo de origem verificável.
- `INSUFFICIENT_SAMPLE`: amostra abaixo do mínimo exigido para o tipo.

### 7.2 Gate editorial

- Título ou pergunta deve nomear o ponto específico; expressões como “para investigar” não bastam.
- A resposta direta deve conter o fato principal e o período quando aplicável.
- A narrativa terá de duas a quatro frases com fato, contexto e principal limite.
- Todo ID citado entre colchetes deverá existir em `documentos_ids`.
- Números, valores e datas do texto deverão pertencer ao conjunto permitido pelo pacote factual.
- O texto não poderá afirmar irregularidade nem transformar ausência nos documentos analisados em inexistência absoluta.
- Perguntas abertas deverão se referir ao caso, não a uma lista genérica de transparência.

## 8. API, admin e interface pública

### 8.1 API pública

- `GET /api/alertas`, `GET /api/alertas/destaques` e `GET /api/alertas/:id` retornarão somente `publicado + ativo`.
- Um item não publicado responderá `404` na rota pública, mesmo que exista no admin.
- A ordenação continuará por data da publicação oficial relacionada, com `publicado_em` apenas como desempate editorial.
- O serializador passará a entregar os campos cidadãos que a interface já tenta consumir.

### 8.2 API e painel administrativo

- A listagem admin mostrará `estado_editorial`, versão do gate, hash, motivos e última tentativa.
- Adicionar filtros por estado e motivo de qualidade.
- Manter o trigger incremental e adicionar opção de reprocessar um item específico.
- Aprovação manual será permitida somente quando o gate factual estiver aprovado e o item estiver em revisão editorial.
- Rejeição e reprocessamento preservarão histórico e evidências.

### 8.3 Página Na Lupa

O detalhe seguirá a hierarquia da Descoberta 57:

1. pergunta ou título específico;
2. resposta direta;
3. métrica principal com período;
4. por que vale olhar;
5. narrativa consolidada;
6. comparativo, quando existir;
7. evidências factuais específicas;
8. documentos oficiais;
9. limites e perguntas abertas.

A lista e a home exibirão somente a pergunta/título, resposta curta, métrica principal, tema e quantidade real de documentos distintos.

## 9. “Publicado recentemente” na home

Criar `listPublicacoesRecentes({ limite })`, sem reutilizar a ordenação geral do acervo:

```sql
SELECT ...
FROM documentos
WHERE date(data_publicacao) IS NOT NULL
  AND date(data_publicacao) <= date('now', 'localtime')
ORDER BY date(data_publicacao) DESC, id DESC
LIMIT @limite
```

Regras:

- `data_abertura`, `coletado_em` e `atualizado_em` não substituem `data_publicacao` nessa seção.
- Documentos sem data permanecem pesquisáveis no acervo.
- Datas futuras não aparecem como publicações recentes.
- Empate no mesmo dia é resolvido por `id DESC`.
- A home continuará mostrando oito documentos.

## 10. Migração do acervo atual

1. Adicionar as colunas editoriais com migração idempotente.
2. Marcar todos os registros existentes como `revisao` antes de ativar o novo filtro público.
3. Classificar os 49 legados com `LEGACY_NO_QUALITY_GATE`.
4. Retornar os 9 itens `limite_ciclo` para `candidato` e removê-los imediatamente das APIs públicas.
5. Regenerar os 22 itens `ok` usando fatos atuais e o contrato v3; o status antigo não concede publicação.
6. Desmembrar ou rejeitar os 20 cestos anuais de recorrência/eventos.
7. Recalcular os 10 cestos de preços por produto e unidade comparável.
8. Reprocessar a Descoberta 57 pelo mesmo fluxo, sem exceção hard-coded, e exigir que continue aprovada.
9. Preservar os registros antigos no admin; não excluir alertas, vínculos ou evidências.
10. Só encerrar a migração quando não houver item público fora de `publicado` e todos os números públicos forem reproduzíveis.

Sequência operacional: aplicar a migração; confirmar que todos os existentes ficaram fora da API pública; executar `npm run descobertas:processar -- --dry-run --force`; revisar contagens e motivos; executar o mesmo comando com `--force`; por fim rodar o ciclo factual completo para confirmar idempotência. O modo sem `--dry-run` é o único que persiste estados, narrativas e histórico.

## 11. Pacotes de implementação

### P0 — Segurança editorial

- Adicionar estado editorial e filtro `publicado + ativo`.
- Corrigir o serializador dos campos cidadãos.
- Ocultar pendentes e legados por migração.
- Entregar testes de API impedindo vazamento de candidatos.

### P1 — Pacote factual e gate

- Implementar `discovery_v3`, hash das evidências e códigos de reprovação.
- Separar fatos determinísticos da narrativa IA.
- Implementar os gates factual e editorial.
- Transformar 57 e 132 em fixtures positiva e negativa.

### P2 — Detectores específicos

- Corrigir deduplicação documento/anexo.
- Reconstruir recorrência, eventos e preços com as regras deste plano.
- Ajustar chaves de idempotência para `tipo + subject_key + período`.

### P3 — Worker e operação

- Refatorar o worker incremental para operar pela máquina de estados.
- Reabrir somente itens com `evidencias_hash` alterado.
- Expor fila, motivos, duração, retries e watermarks no admin/status.

### P4 — Migração, UI e home

- Reprocessar os 80 registros ativos.
- Atualizar lista, detalhe e destaques da home.
- Implantar a consulta estrita de publicações recentes.
- Executar smoke test completo antes de considerar a migração encerrada.

P0 bloqueia P1–P4. P1 antecede P2 e P3. P2 e P3 devem estar concluídos antes do reprocessamento de P4.

## 12. Testes obrigatórios

### Unitários

- Múltiplos anexos do mesmo documento contam como um documento distinto.
- Objetos heterogêneos com palavras genéricas não formam recorrência.
- Mesmo CNPJ e objeto equivalente em processos distintos formam recorrência.
- Eventos diferentes no mesmo ano não são misturados.
- Itens de unidades diferentes não entram no mesmo comparativo.
- Descoberta 57 passa em todos os gates.
- Pacote equivalente à Descoberta 132 falha com `RECURRENCE_NOT_PROVEN`, `MIXED_SUBJECTS` e `DOCUMENT_COUNT_MISMATCH`.
- Números ou documentos inventados pela narrativa são rejeitados.
- Métricas determinísticas sobrevivem mesmo quando a IA retorna `metricas: {}`.
- Falha do provedor não publica fallback.

### Integração

- APIs públicas retornam apenas `publicado + ativo`.
- API admin continua acessando candidatos, revisões e rejeitados.
- Reprocessamento com o mesmo hash não chama IA nem duplica vínculos.
- Mudança de evidência altera o hash e reabre o item.
- Migração é idempotente e preserva dados anteriores.
- Home ordena corretamente datas cruzando anos e exclui datas nulas, inválidas e futuras.

### E2E e validação real

- Home -> card Na Lupa -> detalhe -> evidências -> fonte oficial.
- A Descoberta 57 mantém início, meio, fim e cálculo 60 + 10 = 70.
- A Descoberta 132 deixa de ser acessível publicamente no formato atual.
- Um novo caso de recorrência mostra exatamente o que se repetiu e em quais processos.
- “Publicado recentemente” apresenta datas estritamente decrescentes.
- Build do frontend, testes focados, suíte geral e smoke das rotas públicas ficam verdes.

## 13. Observabilidade e critérios de conclusão

Registrar por ciclo:

- candidatos selecionados;
- aprovados factual e editorialmente;
- publicados;
- enviados para revisão por código;
- falhas de IA e retries;
- itens ignorados por hash inalterado;
- duração total e watermark.

O trabalho estará concluído quando:

- nenhuma API pública expuser estado diferente de `publicado`;
- nenhum cesto anual genérico permanecer público;
- toda recorrência nomear o elemento recorrente e os processos que a comprovam;
- todo comparativo de preço usar produto e unidade equivalentes;
- todas as métricas públicas forem recalculáveis pelas evidências;
- a Descoberta 57 passar como fixture positiva e a 132 falhar como fixture negativa;
- os documentos da home estiverem ordenados exclusivamente por `data_publicacao DESC`;
- filas, reprovações e falhas estiverem visíveis no admin e nos logs;
- testes, build e smoke test real estiverem verdes.

## 14. Fora de escopo

- Notificações por e-mail, WhatsApp ou push.
- Comentários ou denúncias enviados por cidadãos.
- Modelo de acusação ou classificação jurídica de irregularidade.
- Comparações com municípios externos sem uma base equivalente e verificável.
- Exclusão física dos alertas antigos durante esta migração.
