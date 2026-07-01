# Current Work — Monitor Ritápolis

Foco operacional imediato. Atualizar sempre que uma fase for concluída ou a prioridade mudar.

## ▶ Próxima tarefa — Qualidade de conteúdo: resumos + descobertas (2026-07-01)

Pedido do usuário após revisar `/anexo/3284` e `/descobertas/57` ao vivo.
Quatro frentes (1–4 abaixo). Ordem sugerida: **1 → 2 → 3 → 4** (a rotina de
resumo de anexo destrava qualidade em cascata: anexos melhores → fatos
melhores → descobertas melhores; modelo de IA pode ser decidido em paralelo).

> ⚠️ **Risco transversal:** a árvore de trabalho já está grande e sem commit
> (ver seção "▶ Como retomar" mais abaixo). Cada item novo aqui **aumenta**
> esse diff. Recomendado: commitar o que já está pronto (Descobertas v1 +
> handoff) **antes** de começar a mexer em prompt/contrato/schema — evita
> misturar "trabalho já validado" com "experimento em andamento" no mesmo
> commit grande e dificultar reverter se um experimento não funcionar.

### 1. Resumo de anexos é heurística, não IA — criar rotina de regeneração ✅ CONCLUÍDO (2026-07-01)

**Causa raiz confirmada:** `resumirAnexoLocal()` em
[`src/inteligencia/fatos-extractor.js:248`](src/inteligencia/fatos-extractor.js:248)
não chama nenhum provedor de IA — pega mecanicamente "a primeira frase com mais
de 40 caracteres" do texto extraído (`provider: 'local'`,
`modelo: 'heuristico-anexo'`). É por isso que o resumo em `/anexo/3284` (e em
todos os anexos) é pobre: não há compreensão nenhuma do conteúdo, só recorte de
texto corrido, que geralmente é ruído de OCR/formatação de PDF.

Também confirmado: **não existe rota admin nem botão para regenerar** o resumo
de um anexo — a única via é o CLI `npm run inteligencia:extrair-fatos -- --apply
--documentos=<id>`, que roda por *documento* (não por anexo) e sempre chama a
mesma heurística.

- [x] Trocar `resumirAnexoLocal` por uma chamada real de IA — feito em
      [`src/ai/summarize-anexo.js`](src/ai/summarize-anexo.js) (contrato
      [`anexo-resumo-contract.js`](src/ai/contracts/anexo-resumo-contract.js) +
      prompt [`anexo-resumo-prompt.js`](src/ai/prompts/anexo-resumo-prompt.js),
      contrato de saída compatível com `frontend/app/anexo/[id]/page.js`.
      TDD: 9 testes de contrato + 5 de `summarizeAnexo` (texto ruim, IA falha,
      fora do contrato, `AI_SUMMARY_ENABLED=false` → sempre cai pro heurístico
      sem lançar erro).
- [x] Endpoint admin `POST /api/anexos/:id/resumir` (enfileira job; 202 +
      `job.id`) + `GET /api/anexos/resumos/jobs/:id` (polling de status).
- [x] Botão "Regenerar resumo" — `frontend/app/components/AnexoResumoAction.js`
      (mesmo padrão de `AiSummaryAction`: enfileira, faz polling, atualiza a
      página), plugado em `/anexo/[id]` dentro de `admin-only`. Selo público
      "resumo automático (sem IA)" vs "resumo gerado por IA" via `resumo.aviso`
      (não depende de campo admin-only stripado pelo backend).
- [x] Rotina em lote: `scripts/regenerar-resumos-anexos.js` (`npm run
      inteligencia:regenerar-resumos-anexos[:dry]`) — reentrante por
      `contrato_versao='anexo-2.0'` + `texto_hash`; `--force` para regenerar
      mesmo os já atualizados; `--documento=N` para escopo.

**Pontos adicionais — todos resolvidos:**
- [x] **Não tornar síncrono.** Fila própria
      `documentos_anexos_resumos_ai_jobs` (mesmo padrão de
      `documentos_resumos_ai_jobs`) + `src/ai/anexo-summary-job-worker.js`
      (setTimeout 0, um job por vez, `recoverStaleAnexoResumoJobs` destrava
      jobs presos). `fatos-runner.js` **não foi tocado** — continua usando o
      heurístico inline (rápido, sem IA) para o pipeline de fatos em lote; a
      IA só roda pelo caminho novo (botão ou script).
- [x] **Gate de qualidade de OCR.** `textoConfiavelParaIa()` reaproveita
      `isImageBasedPdf` (já existente) — **verificado ao vivo**: anexo 3284
      (o exemplo original do usuário) foi corretamente detectado como OCR
      ruim e manteve o heurístico em vez de mandar ruído pra IA.
- [x] **Dedupe por `texto_hash`** — `UNIQUE(anexo_id, texto_hash,
      contrato_versao)` na tabela + upsert; o script de lote pula anexos já
      atualizados por padrão (só reprocessa com `--force`).
- [x] Orçamento de IA: delay de 1,5s entre chamadas de IA no script de lote
      (só quando a chamada realmente acontece, não no fallback heurístico).

**Achado real ao testar contra a API de verdade:** o modelo às vezes devolve
`quantidade` como string formatada BR (`"12.400,00"`) em vez de number —
contrato rejeitava e caía pro heurístico à toa. Corrigido com coerção BR-aware
no contrato (`coagirQuantidade`, testado com 3 casos: BR, simples, não-numérico
→ null). Confirmado ao vivo: anexo #3285 (Chamamento 003/2026, exposição
agropecuária) gerou resumo de IA real e correto após o fix.

### 2. Página `/descobertas` — consolidar texto disperso ✅ IMPLEMENTADO (2026-07-01, verificação de regen. em andamento)

**Correção importante face à v1 deste item:** a "Descobertas" tem duas etapas
distintas — **(1) agrupamento por tema**, feito por inferência/regras (não IA:
`src/alertas/discovery-candidates.js` + `detectores/fatos-agregados.js`), e
**(2) investigação IA** do pacote de documentos do mesmo tema, buscando falhas
e inconsistências (contrato `discovery-investigation-v2`). O exemplo de
árvores/R$-por-unidade **não é um template universal** — descobertas de outras
áreas (saúde, contratos recorrentes, eventos) têm formas diferentes de conteúdo
e **não devem ser forçadas num formato numérico fixo**. A recomendação abaixo é
sobre **estrutura adaptável de conteúdo**, não uma fórmula única.

**Achado de causa raiz (código já lido):** o contrato
(`src/ai/contracts/discovery-investigation-contract.js`) e o prompt
(`src/ai/prompts/discovery-investigation-prompt.js`) pedem `hipotese_publica`
(1 frase) e `o_que_os_dados_mostram` (array de **fatos atômicos**, 1 a 8 itens)
como campos **separados** — isso empurra o modelo a listar fatos soltos em vez
de escrever uma narrativa corrida que já soma/computa quando fizer sentido. Ao
mesmo tempo, o contrato **já tem** `metricas` e `comparativos` como
`z.record(string, any)` — **schema livre, pronto para qualquer formato de
métrica por tema** — mas o frontend (`descobertas/[id]/page.js`) **ignora os
dois campos** e só lê `alerta.valor_total` + `metadados.unidade` (o card fixo
"Métrica principal"). Ou seja: o backend já é flexível; quem está rígido é o
prompt (pede fatos soltos) e o frontend (não usa o campo livre que existe).

- [x] **Prompt/contrato:** novo campo opcional `narrativa_consolidada` em
      [`discovery-investigation-contract.js`](src/ai/contracts/discovery-investigation-contract.js)
      (parágrafo único, 2-4 frases). Prompt atualizado
      ([`discovery-investigation-prompt.js`](src/ai/prompts/discovery-investigation-prompt.js))
      pedindo consolidação com cálculo de razão **só quando fizer sentido**.
      `o_que_os_dados_mostram[]`/`lacunas_encontradas[]` mantidos como
      evidência de apoio (não removidos do contrato).
- [x] **Frontend:** `MetricasGenericas` em
      [`descobertas/[id]/page.js`](frontend/app/descobertas/[id]/page.js) —
      renderiza `discovery.metricas`/`comparativos` (Record livre) como grade
      de 0/1/N entradas; sem seção quando vazio (sem template forçado).
- [x] "Período coberto" demovido para legenda dentro da seção "Análise"
      **apenas quando há `narrativa_consolidada`** — formato antigo mantém a
      seção própria (ver ponto de compatibilidade abaixo).
- [x] **Verificado com dados reais (dry, sem persistir) nos 4 temas
      existentes** antes de regenerar de vez:
      - #57 (árvores): *"Os documentos analisados revelam que um edital prevê
        a supressão de 60 árvores [607] enquanto outro menciona a supressão
        de 10 árvores [12]... e que não são encontradas informações sobre
        laudo técnico, autorização ambiental..."* — soma + lacuna na mesma
        prosa, exatamente o pedido do usuário.
      - #131 (compras/preços): calculou **"~66% do valor total"** — uma razão
        diferente (percentual, não R$/unidade), mostrando que o cálculo se
        adapta ao tema em vez de seguir uma fórmula fixa.
      - #132/#133 (contratos recorrentes/eventos): **nenhum número
        calculado** — narrativa puramente qualitativa sobre a lacuna, provando
        que o formato não força métrica numérica em temas que não têm.
      - `metricas`/`comparativos`: o modelo não os populou nestes 4 casos
        (campo fica `{}`) — `MetricasGenericas` já trata isso corretamente
        (seção não aparece).
- [ ] **Regeneração real (persistida) em andamento** via
      `node scripts/gerar-alertas.js --full` — rebuild completo reinvestiga
      todos os candidatos factuais qualificados com o prompt novo. Confirmar
      após concluir: `narrativa_consolidada` populada nos registros, feed
      renderiza sem quebra em `/descobertas`.

**Pontos adicionais — resolvidos:**
- [x] **Nem toda descoberta tem `discovery_v2`** — página trata 3 casos:
      com `narrativa_consolidada` (novo), com `discovery_v2` sem ela (formato
      antigo, rendering **inalterado**), e sem `discovery_v2` (fallback
      `alerta.narrativa`, **inalterado**).
- [x] **Compatibilidade com registros já gerados** — em vez de bump de
      `contrato_versao` (evitaria tocar em várias strings duplicadas pelo
      código), a checagem é por **presença do campo**
      (`discovery?.narrativa_consolidada`), que é opcional no contrato — mais
      simples e igualmente seguro: registros antigos simplesmente não têm o
      campo e caem no branch antigo automaticamente. Não é necessário
      regerar tudo para o novo formato coexistir com o antigo.
- [x] **Guard anti-acusatório estendido** — `assertPublicoCauteloso` agora
      varre `narrativa_consolidada` também; 2 testes novos confirmam rejeição
      de termo acusatório dentro do campo novo.
- [x] **Flag de reversão** — `alertas:narrativa_consolidada_ativa` (seedada,
      editável em `/admin/alertas`, default `true`). Desligar faz prompt e
      fallback voltarem ao formato antigo sem deploy.

### 3. Redundância "Resumo" vs "Análise do processo" (página de documento) ✅ CONCLUÍDO (2026-07-01)

Na página `/documento/[id]`, para editais existem **três blocos narrativos de
IA em sequência**:

1. "Resumo do documento" — `SummaryAndSource.js` (`bestResumo`).
2. "Leitura simples" — `AiSummarySection.js` (`resumo_ai`: objeto, valores,
   alertas estruturados).
3. "Análise do processo" — `IntegratedReadingSection.js` (`leitura_integrada_ai`,
   cruza edital + resultado + produtos).

**Mapeamento (confirmado no código):** `bestResumo()`
([`frontend/app/lib/format.js:71`](frontend/app/lib/format.js:71)) prioriza
`resumo_ai.dados.resumo_cidadao` — e `AiSummarySection.js` **abre exatamente
com essa mesma frase** como título/resumo (linhas 121-122:
`<h3>{dados.titulo_curto}</h3><p>{dados.resumo_cidadao}</p>`). Ou seja: **sempre
que existe leitura de IA, os blocos 1 e 2 mostram a mesma frase-síntese
literalmente duas vezes.** O bloco 3 ("Análise do processo") **não tem
sobreposição real** — é uma análise distinta (cruza documentos, vencedor
confirmado, valor final vs. estimado) que só existe para editais com
resultado/produtos vinculados.

- [x] Mapeado e decidido: **bloco 1 só mostra o texto quando ainda não existe
      leitura de IA** (mantém seu papel de *fallback* — objeto da licitação,
      resumo cru — para documentos sem `resumo_ai` ainda). Quando a leitura de
      IA existe, o bloco 2 já abre com a mesma frase, então o bloco 1 não a
      repete — mantém alertas de qualidade + links de fonte (conteúdo
      exclusivo dele). Bloco 3 mantido **sem alteração** (sem sobreposição).
      Implementado em
      [`SummaryAndSource.js`](frontend/app/documento/[id]/components/SummaryAndSource.js).
- [x] **Ponto adicional:** nenhum componente de `documento/[id]/components/`
      tem teste dedicado hoje (pasta sem cobertura) — não criei arnês de teste
      novo só para esta mudança pontual (desproporcional ao escopo); mudança é
      um condicional de baixo risco, lint limpo. `tests/e2e/*.spec.js` não
      referencia texto fixo desta seção (checado).

### 4. Modelo de IA — o Nemotron Nano é o mais indicado? (análise 2026-07-01)

Pedido do usuário: avaliar o catálogo gratuito da NVIDIA
([build.nvidia.com/models](https://build.nvidia.com/models?filters=nimType%3Anim_type_preview&label=text-to-text))
contra o modelo em uso.

**Hoje:** `.env` define `NVIDIA_MODEL=nvidia/nemotron-3-nano-30b-a3b`
(sobrepõe o default de `src/config.js`, que é `meta/llama-3.1-70b-instruct`) —
usado para **tudo**: resumo, leitura integrada e a investigação de descobertas
(um único `nvidiaModel` para todas as chamadas via `src/ai/providers/index.js`).

**O que é o Nano:** MoE híbrido Mamba-Transformer, 31,6B parâmetros totais mas
só **~3,2B ativos por token** — desenhado pela NVIDIA para *throughput*
(3,3x mais rápido que um Qwen3-30B equivalente), não para profundidade de
raciocínio. Idiomas oficialmente listados: en/es/fr/de/ja/it — **português
não consta** (pode funcionar por generalização multilíngue, mas não é
uma garantia documentada).

**Comparação (mesma API/conta NVIDIA, troca é só o valor de `NVIDIA_MODEL`):**

| Modelo | Ativos/Total | Foco | Observação |
|---|---|---|---|
| `nvidia/nemotron-3-nano-30b-a3b` (atual) | 3,2B / 31,6B | velocidade | PT não confirmado; bom p/ tarefas simples em volume |
| `nvidia/nemotron-3-super-120b-a12b` | 12B / 120B | *agentic reasoning* (posicionamento oficial NVIDIA) | mesma família/API; PT possivelmente nos "+19 idiomas" não individualizados |
| `meta/llama-3.1-70b-instruct` (default do `config.js`) | 70B denso | geral | português historicamente forte na família Llama |
| `meta/llama-3.3-70b-instruct` | 70B denso | geral, ~nível 405B | idem acima, mais recente |
| `qwen3-235b-a22b-thinking` | 22B / 235B | modo de raciocínio dedicado | 201 idiomas (PT incluso); maior/mais lento |

Limite do tier gratuito: **~40 requisições/min** (pode pedir aumento para
~200 no painel NVIDIA) — importa mais para o volume de resumos em lote do
que para a investigação de descobertas (menor volume, maior exigência de
julgamento).

**Recomendação — não trocar tudo, rotear por tarefa:**
- [x] Mantido o modelo rápido/barato (Nano, via `NVIDIA_MODEL`) para tarefas
      de alto volume e baixo risco (resumo simples de documento/anexo) — **sem
      alteração**, nenhum comportamento existente mudou.
- [x] **Override de modelo por chamada implementado**:
      `createAiProvider(env, { model })` em
      [`src/ai/providers/index.js`](src/ai/providers/index.js) aceita um
      modelo específico sem tocar `NVIDIA_MODEL` global. Nova config
      `nvidiaModelInvestigacao` (env `NVIDIA_MODEL_INVESTIGACAO`, vazio por
      padrão = sem override) ligada em
      [`discovery-investigation.js`](src/ai/discovery-investigation.js) —
      só a investigação de descobertas usa o override quando configurado; tudo
      o resto continua no Nano. TDD: 4 testes novos em
      [`providers/index.test.js`](src/ai/providers/index.test.js) (novo
      arquivo — não existia teste dedicado antes).
- [ ] **Testar os dois candidatos em casos reais em português antes de
      fixar** — script de comparação pronto (roda `investigarDescoberta` com
      o modelo padrão vs. um candidato lado a lado, sem persistir), ainda não
      executado por completo (aguardando o rebuild `--full` do item 2
      terminar, para não concorrer no rate-limit). Próximo passo concreto da
      sessão seguinte, se não houver dado ainda: rodar o script de comparação
      contra `nemotron-3-super-120b-a12b` e `llama-3.3-70b-instruct`.

**Pontos adicionais (revisão 2026-07-01):**
- [ ] **O limite de RPM pode variar por modelo** — a fonte NVIDIA diz que os
      ~40 req/min "dependem do modelo e do tráfego atual"; não assumir que o
      Super tem o mesmo teto do Nano sem checar na conta real (painel
      NVIDIA) antes de rotear tráfego de produção para ele.
- [ ] **Latência do Super/Llama-70B vai ser bem maior** (mais parâmetros
      ativos) — isso estica o tempo do lote de `descobertas:investigar` /
      `descobertas-scheduler`. Já tivemos dor de cabeça com processos longos
      sem heartbeat matando silenciosamente (ver `src/utils/progress.js`,
      criado justamente por isso) — reusar esse instrumental ao rodar lotes
      com o modelo novo, não assumir que vai terminar rápido.
- [ ] **Fallback obrigatório.** `alert-generator.js` já tem try/catch com
      narrativa-template quando a IA falha; a investigação de descobertas
      (`discovery-investigation.js`) precisa da mesma resiliência — modelo
      mais pesado/lento tem mais chance de timeout, então erro não pode
      travar o pipeline nem deixar a descoberta sem conteúdo.
- [ ] **Protocolo de comparação, não swap às cegas:** rodar a investigação
      para uma amostra pequena (5–10 descobertas, cobrindo os temas
      diferentes) com cada modelo candidato, salvar lado a lado, e avaliar
      manualmente antes de mudar o `.env` de produção.
- [ ] **Gemini/Groq não são alternativa viável agora:** `.env` não tem
      `GEMINI_API_KEY`/`GROQ_API_KEY` configuradas, e
      `src/ai/providers/index.js` **rejeita** qualquer `AI_PROVIDER` que não
      seja `nvidia` (`throw` explícito). Ficar só nos modelos NVIDIA por ora;
      considerar Gemini/Groq como opção futura separada, não parte deste
      plano.

---

## Qualidade da informação — achados (2026-06-23)

Cobertura está saudável: texto/resumo/análise ~100% do que a fonte oferece
(os 6 sem resumo são `sem_pdf` — fonte sem arquivo). Vencedor 87%.

**`valor_final` (46%) é o gargalo — e é LACUNA DE FONTE, não de processamento.**
Esgotadas 3 vias de recuperação (todas ~0): (a) re-derivar de atas já extraídas
(0 de 265 — atas tabulares não trazem total no texto), (b) somar itens de
produtos (1 doc), (c) extrair recuperáveis (propostas + resultados mal-
classificados: 76 textos, 2 vencedores, 0 valores). A Prefeitura não publica
valor homologado extraível dos anos antigos e Ritápolis não está no PNCP. →
**Não tratar como pendente; rotular honestamente (§11.3 / cobertura honesta).**
Não derivar valor de propostas (são lances ≠ valor final).

Ferramentas: `extrair-texto-anexos.js --rederivar` e `--recuperaveis`.

---

Atualizado em: 2026-07-01 — HANDOFF. Descobertas v1 (thresholds + redesign)
prontos; **subsistema Descobertas v2 (investigação IA + fatos)** e **MVP de
publicação** em andamento; árvore de trabalho grande **sem commit**.

---

## ▶ Como retomar (próxima sessão) — LEIA PRIMEIRO

### 0. Estado do Git — AÇÃO #1: triar e commitar

- **HEAD:** `c115b77` (emendas). Descobertas v1, subsistema `alertas` e o app já
  estão commitados em ancestrais (ex.: `a0fc8b7` sanitizou o tom "Alerta:").
- **Não commitado:** ~50 arquivos **modificados** + ~40 **novos** (subsistemas
  inteiros). Nada foi perdido, mas é **o maior risco de continuidade**.
  → **Primeiro passo: revisar e commitar em blocos coerentes** (agrupamento
  sugerido no fim desta seção). Rode `git status` e `git diff --stat` para o todo.

### 1. Descobertas v1 — UI + thresholds ✅ pronto, SEM COMMIT

Thresholds editáveis em `/admin/alertas` + rebuild com reconciliação
(`generateAlerts({ full: true })` → `repo.removerAtivosNaoListados`, preserva
decisão humana). Página `/descobertas` (lista + detalhe) **reescrita** num CSS
Module próprio (antes usava classes globais inexistentes → renderizava sem
estilo). Verificado no browser, testes verdes, lint limpo. Resultado: 539 docs →
50 descobertas (13 "Vale conferir" + 37 "Curiosidade").
Arquivos: `src/db/alertas-repo.js`, `src/alertas/alert-generator.js` (+testes),
`src/api/server.js`, `scripts/seed-alertas-config.js`, `scripts/gerar-alertas.js`,
`frontend/app/descobertas/*`, `.../admin/alertas/AdminAlertasPanel.js`, `lib/api.js`.

### 2. Descobertas v2 — investigação IA + inteligência de fatos ⏳ NOVO, sem commit, FALTA VALIDAR

Subsistema novo (não commitado) que aprofunda as Descobertas. **Suíte completa
verde (462 testes / 43 suites, 01/07)** incluindo os testes do v2 → falta só
**validar em dados reais** (rodar `descobertas:investigar` + conferir a UI) antes
de commitar:
- `src/ai/discovery-investigation.js` (+ prompt + contrato `discovery-investigation-v2` + teste) — investiga uma descoberta com IA (hipótese pública, o que os dados mostram, lacunas, perguntas abertas, análise admin).
- `src/inteligencia/` — `fatos-extractor`/`fatos-runner` (extrai fatos de texto/produtos/anexos), `discovery-investigation-runner`, `descobertas-scheduler`.
- `src/alertas/discovery-candidates.js` + detector `detectores/fatos-agregados.js` — candidatos por tema (supressão de árvores, preços de itens, recorrência fornecedor↔objeto, gastos de eventos).
- `src/db/inteligencia-fatos-repo.js`, `src/db/produtos-repo.js` (+testes).
- Frontend: `/descobertas` e `[id]` já renderizam `metadados.discovery_v2` (hipótese, fatos, lacunas, evidências, box admin) + `lib/disclaimer.js`.
- npm: `descobertas:investigar`, `inteligencia:extrair-fatos[:dry]`, `inteligencia:auditar`. Já wired em `src/api/server.js`.

### 3. Publicação (MVP) — spec-driven `.specs/` ⏳ rascunho, AGUARDANDO VOCÊ

- Milestone `publicacao-mvp` (`.specs/features/publicacao-mvp/spec.md` + `.specs/STATE.md`, fluxo do skill `tlc-spec-driven`).
- **Status: spec em rascunho, aguardando sua confirmação** das premissas (alvo de deploy, política de credenciais admin, frescor dos dados) antes de Design/Tasks.
- Basic Auth `/admin/*` já implementado (`src/auth/admin-basic-auth.js` + `frontend/middleware.js`). Falta build de produção + Docker + deploy (Fase 5.3).

### Outros itens não commitados
- **Parsers:** melhorias em `document-file.js`, `licitacao-produtos.js`, `licitacao-resultados-itens.js` (+ novos testes) e `technical-visual.js` (classifica anexos técnicos/visuais).
- **PNCP:** `scripts/pncp-*.js` + npm `pncp:sincronizar` (reavaliar — Ritápolis não constava no PNCP).
- Vários scripts de backfill/diagnóstico/auditoria; configs de IDE (`.cursor/`, `.windsurf/`).

### Sugestão de agrupamento de commits
1. Descobertas: thresholds + reconciliação (backend + testes + seed + admin).
2. Descobertas: redesign da UI (CSS Module + páginas lista/detalhe).
3. Descobertas v2: investigação IA + inteligência de fatos (**após** validar suíte).
4. Parsers + PNCP + scripts de dados.
5. Auth/middleware + specs de publicação.

### Setup + verificação
- `npm start` (API 3001 + frontend 3000). Páginas: `/descobertas`, `/admin/alertas`.
- `npm test` (suíte completa) **antes de commitar o v2**.
- Caveman: plugin instalado; ativa em nova sessão via `/caveman`.

---

## Gerador de Alertas de Inteligência — checklist por fase

Plano em `New_work.md`. ✅ feito · 🔄 em andamento · ⬜ pendente.

> **Nomenclatura (público):** "Alertas" → **"Descobertas"** (rota `/descobertas`),
> tom de curiosidade, sem sensacionalismo. Severidade reenquadrada na UI:
> crítico→"Merece atenção", atenção→"Vale conferir", info→"Curiosidade"
> (sem vermelho de pânico). Backend/tabelas seguem `alertas` (interno).

- ✅ **Fase 1 — Schema + repositório** (`alertas`, `alertas_documentos`, `alertas_watermark`, `alertas_config`; `alertas-repo.js` + testes :memory:).
- ✅ **Fase 2 — Detectores + agrupador + consolidador** (puros, TDD): repetição temática, risco-alto (`alertas[].nivel`), valor-relevante (por ano §11.1), anomalia-temporal, questionamentos (`lacunas`/`consistencia`).
- ✅ **Fase 3 — Narrativa IA** (`src/ai/alert-narrative.js` + prompt + Zod, provider mockado no teste).
- ✅ **Fase 4 — Orquestrador + CLI** (`alert-generator.js`, `scripts/gerar-alertas.js`, `npm run alertas:gerar[:dry]`).
- ✅ **Fase 5 — Scheduler + config** (integrado ao `ai-daily-scheduler`).
- ✅ **Fase 6 — API REST** (`/api/alertas`, `/destaques`, `/:id`, `/stats`, `/config`, `POST /gerar`).
- ✅ **Fase 7 — Frontend**: destaques na home · `/alertas` (lista) · `/alertas/[id]` (detalhe) · link na navbar · painel no admin (`/admin/alertas`) · seção em `/inteligencia`.
- ✅ **Fase 8 — Verificação + docs**: ✅ unit/integração (repo, detectores, consolidador) · ✅ `DEVELOPMENT_PLAN.md` + `README.md` · ✅ validação manual (26 descobertas reais, rotas HTTP 200) · ✅ **E2E Playwright** configurado (`playwright.config.js` + `tests/e2e/descobertas.spec.js`, 3 testes verdes: navbar, lista→detalhe com fonte, 404 sem quebrar).
- ✅ **Fase 9 — Afinar thresholds em `/admin/alertas`** (24/06/2026):
  - `alertas_config` estava VAZIO → painel mostrava "usando defaults" sem linhas editáveis. Criado `scripts/seed-alertas-config.js` (idempotente, `--reset`) que semeia as 5 chaves com descrição → aparecem editáveis no admin.
  - **Tuning** (tom curiosidade, município pequeno): `min_repeticao` 2→**4** (corta clusters triviais de 2-3 processos; controla tamanho do feed) · `valor_threshold` 500k→**1M** (reserva "Vale conferir" p/ gasto grande; só re-rotula, não remove) · anomalia 3×/min 3 · todos gatilhos on.
  - **Reconciliação**: `generateAlerts({ full: true })` varre todo o acervo e remove ativos abaixo do threshold (`repo.removerAtivosNaoListados`, preserva arquivado/suprimido humano). Botão "Gerar descobertas agora" agora faz rebuild completo; ciclo diário segue incremental. CLI `--full`.
  - Resultado: 539 docs → 50 descobertas ativas (**13 "Vale conferir" + 37 "Curiosidade", 0 alarmante**), 6 obsoletas reconciliadas. Testes verdes (repo reconcile + generator full/incremental).

- ✅ **Fase 10 — Redesign da UI de `/descobertas`** (24/06/2026):
  - **Bug raiz:** a página referenciava classes globais inexistentes (`citizen-card`, `citizen-card-title`, `filter-bar`, `page-head`) → cards renderizavam como `<a>` cru, sem estilo. (As classes definidas eram `citizen-row`, etc.)
  - Criado `frontend/app/descobertas/styles.module.css` (sobre os tokens v2 de `globals.css`); **lista** e **detalhe** reescritas para o módulo.
  - Lista: header (eyebrow/título/subtítulo) · filtros em chips com ponto colorido por nível · grade responsiva de cards (nível = ponto+rótulo, paleta calma; valor em algarismos tabulares com período §11.1; nº docs + data com ícones SVG; line-clamp no título/resumo).
  - Detalhe: back link · título · badges calmos · seções Análise/Valores (metric cards)/Período/Pontos a investigar/Documentos vinculados (com link de fonte §11.3).
  - A11y: foco visível, `prefers-reduced-motion`, cor nunca é o único indicador. Verificado no browser (lista, "Vale conferir" com valor, detalhe com 10 fontes); lint limpo, 0 erro de console.

Validado em dados reais: 539 docs → 50 descobertas com narrativa IA, valores por ano (thresholds afináveis no admin).

---

## Diagnóstico (10/06/2026 — sobre o banco real, 626 documentos)

| # | Achado | Evidência |
|---|---|---|
| 1 | 58 licitações classificadas como `documento_publico` (dispensas, chamamentos, leilões) | 53 têm `licitacoes_detalhes`, 52 estão em grupos |
| 2 | Cobertura de IA é um precipício histórico | 2024–26: 80–97% · 2020: 0/61 · 2021: 0/47 · 2023: 1/55 |
| 3 | 1.208 anexos (61%) com extração pendente | maior mina de vencedores/valores antigos |
| 4 | Unificação despesa↔licitação latente | 2.538 despesas com `licitacao_ref`, 127 CNPJs em comum |
| 5 | 80 documentos sem texto útil | 33 PDF-imagem, 51 sem PDF, 3 erro |
| 6 | 7 pares de editais duplicados (número+ano+tipo) | dedup + endurecer identidade |
| 7 | `status_revisao='pendente'` em 100% dos 2.955 produtos | fluxo de revisão nunca roda |
| 8 | Páginas órfãs / redundantes (`/analises`, `/temas`) | fora da navegação |
| 9 | Schema drift: 5 tabelas no banco não estão em `schema.sql` | `fornecedores_perfil`, `licitacoes_categorias`, `transparencia_*` |
| 10 | 57 licitações (12%) na categoria "Outros"; 1 valor errado (doc 29: R$ 60) | refino IA + gate de validação |

---

## Plano por fases (conteúdo primeiro, publicação depois)

### Fase 1 — Integridade da base ✅ CONCLUÍDA (exceto 1.2-C, movida p/ Fase 4)
- [x] 1.1 `schema.sql` sincronizado com o banco real (5 tabelas + 9 índices adicionados; sem drift de tabela nem de coluna — validado contra `:memory:`)
- [x] 1.2-A Classificador `inferTipo` do coletor corrigido (TDD: +chamamento, chamada pública, credenciamento, concorrência, leilão, tomada de preços, concessão, "inexibilidade"). 16 testes novos · `site-prefeitura.test.js`
- [x] 1.2-B Backfill `scripts/reclassificar-tipos.js`: 35 docs reclassificados (28→edital, 7→contrato) pelo papel do grupo; 21 atas e 2 atos de conselheira tutelar mantidos. Backup em `data/ritapolis-backup-reclassificar-*.db`
- [ ] 1.2-C **(= Fase 4.1)** `/licitacoes` listar por GRUPO (`documento_canonico_id`) em vez de `tipo='edital'` — torna visíveis os 31 grupos só-ata/contrato. Refactor da página pública; fazer com TDD junto da Fase 4
- [x] 1.3 Merge seguro: 4 uploads duplicados fundidos (`scripts/merge-duplicatas.js`; keepers 519/517/513/373, anexos+procedência preservados). Eram "5", mas 371/372 NÃO é duplicata (ata+edital do mesmo processo) — preservado. Os 3 pares restantes são documentos distintos com `numero` mal-parseado (falsos positivos, não tocar). Backup em `data/ritapolis-backup-merge-*.db`
- [x] 1.4 Gate de valores: função pura `src/licitacoes/valores.js` (TDD, 11 testes) + `scripts/aplicar-gate-valores.js`. Doc 29 (R$ 60, parse da prosa) → "não verificado" com trilha em `origem_detalhe`. 1 de 177 valores invalidado (zero falso positivo). Piso R$100 / teto R$100M
- [x] 1.5 Tela de revisão de produtos em `/admin/qualidade` (decisão: curadoria admin). Repo `produtos-revisao-repo.js` (TDD, 9 testes :memory:) + 4 endpoints + componente client `RevisaoProdutos.js` (fila por menor confiança, validar/rejeitar item, validar lote ≥0.8). Endpoints validados via smoke test. Estados: pendente/validado/rejeitado
- [x] 1.6 (bônus) Bloqueador de build corrigido: `.eslintrc.js` da raiz era herdado pelo frontend ESM e travava `next build`. Adicionado `frontend/.eslintrc.json` (`root: true`) + removido `eslint-disable react/no-danger` órfão. **`next build` passa limpo (23/23 páginas)** — destrava Fase 5

> ⚠️ Atenção 1.2-C: re-rodar `syncLicitacoesGrupos` ANTES do refactor descartaria as 21 atas/7 contratos dos grupos (o input `listDocumentosEditalParaGrupos` filtra `tipo='edital'`). Ampliar o input set de agrupamento faz parte do Passo C.
> 🔧 Dívida 1.3-resíduo: o parsing de `numero` une processos distintos sob o mesmo número (0001/2018 são 3 processos; 011/2016. são 2 aditamentos). Endurecer `findDocumentoByIdentity`/parser de número fica para a Fase 2.

**Suíte: 130/130 testes verdes. Lint limpo.**

### Fase 2 — Destravar conteúdo represado  ⚠️ RE-ESCOPADA com evidência (10/06)

> **Correção de premissa:** os 1.208 anexos "pendentes" NÃO são mina de vencedores — são 526 editais, 528 "outro", 131 propostas, 23 recursos. Os anexos de **resultado** (ata/homologação/resultado) já foram TODOS extraídos. O gargalo real dos vencedores antigos é **OCR**: 69 anexos de resultado falharam com "texto vazio" = PDFs escaneados (imagem), concentrados em 2017–2021. Em 2020, 37 editais têm anexo de resultado coletado mas só 19 têm vencedor.

- [x] 2.2 **Vencedores derivados dos produtos** (TDD): `src/licitacoes/vencedor.js` (7 testes) + `scripts/derivar-vencedores-produtos.js`. Promove o fornecedor dominante dos itens já extraídos ao nível do documento quando o parser de prosa falhou. **+39 vencedores (273→312)**, ganhos em 2019/2020/2021/2023. `origem='derivado_produtos'`. Backup salvo
- [x] 2.1→**ADIADO COM FLAG** — decisão 10/06: OCR fica para tentativa futura (Gemini visão ou tesseract local). **74 anexos marcados `status_extracao='requer_ocr'`** via `scripts/marcar-requer-ocr.js` (69 "texto vazio" + 5 imagens .jpg/.jpeg). Filtro de retry em `listAnexosResultadoParaExtracao` agora pula `requer_ocr` (reprocessável só com `--force`)
- [x] 2.3 Investigado: os 6 "Invalid PDF structure" não eram PDFs corrompidos — 5 eram imagens (→ fila OCR) e 1 é `.rtf` (único `erro_pdf` restante; parser RTF não vale o esforço por 1 arquivo)
- [x] 2.4 Verificado: backlog de resumos (308 docs, 2017–2023) se resolve sozinho — scheduler ordena pendentes por data DESC e com 2024–26 completos desce aos antigos (~180 docs/dia ⇒ ~2 dias de API ligada). Nenhum código necessário

> ### ⭐ DESTAQUE — Fila de OCR (importância alta, tentativa futura)
> **141 anexos escaneados aguardam OCR** (`status_extracao='requer_ocr'`; 74 de resultado + 67 de edital), **16 processos sem vencedor** e **~19 docs sem texto** dependem exclusivamente deles. NÃO são só arquivos antigos: a prefeitura continua publicando escaneados em 2024–2026, então a fila crescerá. Opções na decisão futura: Gemini visão (PDF nativo, requer `GEMINI_API_KEY`) ou tesseract local (offline, requer binário Windows + idioma pt). Consulta da fila: `SELECT * FROM documentos_anexos WHERE status_extracao='requer_ocr'`.
- [x] 2.5 Leitura integrada estendida para 2023–2025 via `scripts/correlacionar-licitacoes-lote.js` (npm `ai:correlacionar:lote`; retomável por cache de hash). **141 leituras geradas, 0 erros → cobertura 100% em 2023–2026 (165/165 elegíveis)**
- [x] 2.6 Texto via anexos para docs sem texto: `src/parsers/anexo-texto.js` (TDD, 7 testes) + `scripts/extrair-anexos-edital-sem-texto.js` (npm `licitacoes:extrair-anexos-sem-texto`). 76 anexos baixados/extraídos → **4 docs recuperaram texto** (242, 290, 438, 603 — agora elegíveis p/ resumo IA); 67 anexos também eram escaneados → fila OCR (total **141**). Confirma: docs `imagem` têm anexos também escaneados — OCR é O gargalo
- [x] 2.7 Identidade endurecida (TDD, 16 testes novos em `processo.test.js`): `normalizarNumeroDocumento` (remove pontuação solta; 3 numeros corrigidos no banco) + `titulosCompativeis` (refs numéricas disjuntas → incompatível; senão Jaccard ≥ 0.5) ligado em `findDocumentoByIdentity`/`saveDocumento`. Regressão validada no banco real: processo distinto com mesmo número NÃO casa; re-coleta do mesmo casa; sem título mantém comportamento antigo

**FASE 2 CONCLUÍDA** (OCR adiado com flag — ver destaque acima).

### Fase 3 — Unificação com IA (diferencial do produto) ⏳ EM EXECUÇÃO
- [x] 3.1 Vínculo licitação↔empenho **corrigido** (era o gap real): o crosswalk antigo casava por número solto (LIKE) e ignorava o tipo → **46% dos 3.216 empenhos vinculados estavam no edital errado (R$ 31M mal-alocados)**. Novo `src/licitacoes/modalidade.js` (TDD, 19 testes) faz match EXATO tipo+número+ano; `crosswalkDespesasDocumentos({relink})` reconstrói. Resultado: **3.216→1.621 links, 0 divergência de tipo**; 130 modalidades sem link = sem edital correspondente (legítimo, 0 bug). Vencedores via empenho re-derivados. Script `npm run transparencia:revincular`
- [x] 3.2 Dossiê único de fornecedor: `src/licitacoes/cnpj.js` (TDD, 9 testes) normaliza CNPJ; `consolidarFornecedores` reescrito agrupa por CNPJ normalizado (corrige 49 fragmentos por formato misto) e une **licitado (produtos+vencedor) + pago (empenhos)**. `fornecedores_perfil` ganhou `total_valor_pago`, `n_empenhos`, `n_anos_pago`. **25 → 494 perfis**, 184 com licitação+pagamento. `getFornecedorByCnpj` normaliza CNPJ e traz pagamentos. Exclui INSS/FGTS/folha
- [x] 3.3 Comparação histórica de preços via **embeddings** (NVIDIA `baai/bge-m3`): `src/licitacoes/agrupamento-produtos.js` (TDD, 16 testes) — cosine + agrupamento guloso + **guarda numérica** (impede mesclar specs diferentes: pneu 205/70R15 ≠ 185/60R15). `scripts/agrupar-produtos-embeddings.js` (limiar 0.93). 2.149 descrições → 2.040 grupos; **410 grupos comparáveis em 2+ anos** (ex.: cheiro verde 2019→2023). Tabela `produtos_grupos` + `licitacoes_produtos.grupo_id`; endpoints `/api/produtos/grupos-comparaveis` e `/grupos/:id/evolucao`. Provider ganhou `embed()`. Limitação: poucos merges por tipo (feijão preto/carioquinha) onde o boilerplate domina o texto

**FASE 3 CONCLUÍDA.** A Fase 4 (UX) tem agora muito conteúdo limpo a expor: dossiê de fornecedor (licitado+pago), evolução de preços, Cultura e Eventos, cobertura honesta.
- [x] 3.4 Categorias refinadas: classificador extraído p/ `src/licitacoes/categoria.js` (domínio + TDD, 14 testes) + nova categoria **Cultura e Eventos** (shows/bandas/rodeios via inexigibilidade, antes ocultos) + credenciamento→Serviços. **"Outros" 57→37**, Cultura e Eventos=74. Frontend ligado (badge, filtro, /temas, /sobre). Resíduo encolhe quando backlog de resumos completar

### Fase 4 — Arquitetura de informação e UX ✅ CONCLUÍDA
- [x] **Dossiê de fornecedor unificado** (`5894036`): `/credores/[cnpj]` ganha "Licitado vs. pago"; corrige regressão do 3.2 (lookup de CNPJ normalizado); remove `getFornecedorByCnpj` + endpoint redundante. Validado por screenshot
- [x] **Evolução de preços** (`0b2eb09`): seção interativa em `/inteligencia` (master-detail + sparkline + variação no período) consumindo os grupos do 3.3. Validado por screenshot
- [x] 4.3 Página do processo como hub — **já era um hub** (resumo do documento / análise do processo / produtos / grupo / empenhos / fontes, rótulos distintos); o fix do 3.1 tornou os empenhos exibidos corretos. Confirmado por screenshot
- [x] 4.1/4.2 Navegação fundida: Inteligência + Transparência → **"Dinheiro público"** (`45811eb`). Nav de 7→6 itens; `/transparencia` é o hub (orçamento + pagamentos + evolução de preços), `/inteligencia` vira aprofundamento linkado. Validado por screenshot
- [x] 1.2-C `/licitacoes` lista por grupo (`99f007c`): +16 processos só-ata/extrato agora visíveis
- [x] 4.4 Cobertura honesta por ano (`233068e`): seção em `/inteligencia` com % de vencedor/valor/resumo/análise por ano, barras coloridas. Validado por screenshot
- [ ] (opcional, baixa prioridade) `/temas` → filtro de `/licitacoes`; `/analises` redirecionar (órfãs, já fora da nav)

### Fase 5 — Publicação
- [x] 5.1 Basic Auth `/admin/*` com `ADMIN_AUTH_USER` + `ADMIN_AUTH_PASSWORD` e fallback aberto para desenvolvimento local
- [x] 5.2 Testes de parser/contratos verificados antes do deploy: `npm test` passou com 40 suites e 451 testes
- [ ] 5.3 Build de produção + Docker + deploy (Railway/Fly + Vercel)

---

## Top 3 (se precisar escolher)
1. Anexos pendentes + OCR (2.1–2.2) — destrava vencedores/valores antigos
2. Vínculo licitação↔pagamento + dossiê de fornecedor (3.1–3.2) — o diferencial
3. Reclassificação + cobertura honesta (1.2, 4.4) — integridade dos números exibidos

---

## Estado da base (referência rápida — 10/06/2026)

| Camada | Estado |
|---|---|
| Documentos | 626 (475 edital, 58 documento_publico, resto câmara/pncp) |
| Resumos IA — 2024-26 | ✅ 80–97% |
| Resumos IA — 2017-23 | ❌ ~quase zero (backlog real) |
| Leitura integrada (v2.0) | ⚠️ só 2026 (30 docs) |
| Anexos extraídos | ⚠️ 424 ok / 1.208 pendentes / 75 erro |
| Despesas | ✅ 16.675 (2.538 com licitacao_ref) |
| Fornecedores consolidados | ⚠️ 25 (de 192 vencedores / 411 credores) |
| Produtos | 2.955 (100% status_revisao=pendente) |

---

## Comandos rápidos

```bash
npm start                                          # API 3001 + frontend 3000
npm run ai:status -- --ano=2026                    # cobertura IA
npm run inteligencia:auditar                       # reauditoria
npm run build --prefix frontend                    # build produção
```

---

## Regras de trabalho

- `DEVELOPMENT_PLAN.md` — roadmap e histórico de versões
- `CURRENT_WORK.md` — foco imediato, manter enxuto
- TDD: teste antes da implementação (ver `CLAUDE.md`)
- Arquivos temporários (logs, screenshots, checklists) devem ser deletados após o uso
- O frontend consome apenas a API própria
- A fonte oficial sempre tem prioridade sobre o resumo de IA
- Mock nunca aparece em produção
