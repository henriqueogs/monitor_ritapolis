# Monitor Ritapolis Publicacao MVP Specification

## Problem Statement

O Monitor Ritapolis ja coleta, estrutura e interpreta dados publicos do municipio, mas ainda nao esta pronto para publicacao ampla porque controles administrativos estao expostos, o fluxo de deploy nao esta fechado e algumas garantias de qualidade precisam virar criterios verificaveis. O objetivo deste milestone e transformar a plataforma local em um MVP publico confiavel: cidadaos veem informacao rastreavel; operadores mantem a base sem expor ferramentas internas; e o deploy pode ser repetido com seguranca.

## Goals

- [ ] Publicar uma versao navegavel do Monitor Ritapolis com paginas publicas consumindo dados reais e verificaveis.
- [ ] Proteger todas as superficies administrativas antes de expor o projeto fora do ambiente local.
- [ ] Garantir que lacunas de dados, fonte oficial e periodo de valores sejam sempre explicitados nas telas publicas criticas.
- [ ] Entregar um caminho operacional minimo para coleta, IA, alertas/descobertas e auditoria de dados.
- [ ] Validar o build/deploy com testes automatizados e checklist manual de smoke test.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Sistema completo de usuarios, OAuth, perfis e permissoes granulares | O roadmap pede protecao minima por Basic Auth nesta fase. |
| Edicao publica colaborativa ou comentarios de cidadaos | A prioridade e leitura verificavel, nao participacao social interativa. |
| Notificacoes por e-mail, WhatsApp ou push | Futuro natural das Descobertas, mas nao necessario para publicacao inicial. |
| Migracao obrigatoria para banco remoto gerenciado | SQLite local segue decisao tecnica atual; deploy pode preservar SQLite com backup/volume. |
| Resolver todas as lacunas historicas de OCR/valor final | A regra do produto e rotular lacunas honestamente quando a fonte nao permite extracao. |
| Reescrever arquitetura ou design system | O milestone endurece e publica o produto existente. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Publicacao inicial | Backend em Railway/Fly com SQLite persistente; frontend em Vercel | Esta opcao aparece no roadmap e minimiza mudancas no stack atual. | n |
| Autenticacao admin | HTTP Basic Auth em `/admin/*` no frontend e `/api/admin/*` + endpoints operacionais equivalentes no backend | Evita expor botoes e APIs de manutencao enquanto mantem simplicidade. | n |
| Credenciais admin | `ADMIN_USERNAME` e `ADMIN_PASSWORD` obrigatorios fora de desenvolvimento | Mantem segredo fora do codigo e falha fechado em producao. | n |
| Dados publicos | Publico ve somente dados reais persistidos, nunca mock ou placeholders enganosos | Regra permanente do projeto. | y |
| IA em producao | IA pode falhar sem quebrar paginas; falhas ficam visiveis apenas como lacunas/estado operacional admin | IA apoia a leitura, mas nao deve impedir acesso aos fatos coletados. | n |
| Frequencia de atualizacao | Coleta e processamento podem rodar manualmente ou por scheduler do processo nesta fase | O produto ja tem schedulers, mas deploy inicial pode validar manualmente antes de automatizar. | n |
| OCR historico | Fila `requer_ocr` fica fora do bloqueio de publicacao, desde que apareca como lacuna honesta | Ja documentado como gargalo de fonte/processamento futuro. | y |

**Open questions:**

1. O deploy alvo sera mesmo Vercel + Railway/Fly, ou voce quer outro ambiente?
2. A area admin deve proteger tambem endpoints como `/api/alertas/config`, `/api/alertas/gerar`, `/api/coletas/*`, `/api/ia/resumos/*` e acoes de documento (`resumir`/`correlacionar`) mesmo sem prefixo `/api/admin`?
3. Para o MVP publico, atualizacao automatica diaria e obrigatoria ou basta um runbook manual confiavel?

---

## User Stories

### P1: Publicacao Segura do Admin MVP

**User Story**: Como operador do Monitor Ritapolis, quero acessar ferramentas administrativas com uma credencial simples para que eu possa publicar o site sem expor manutencao, reprocessamento ou configuracoes ao publico.

**Why P1**: O proprio README e `/sobre` indicam que `/admin` ainda e publico; isso bloqueia publicacao ampla.

**Acceptance Criteria**:

1. WHEN uma requisicao sem credenciais acessa qualquer rota `/admin/*` no frontend THEN o sistema SHALL responder com desafio Basic Auth ou bloquear acesso antes de renderizar conteudo administrativo.
2. WHEN uma requisicao sem credenciais chama endpoints operacionais protegidos THEN o sistema SHALL responder `401` e nao executar efeitos colaterais.
3. WHEN credenciais validas sao enviadas THEN o sistema SHALL permitir acesso admin sem alterar o comportamento publico.
4. WHEN a aplicacao roda em producao sem `ADMIN_USERNAME` ou `ADMIN_PASSWORD` THEN o sistema SHALL falhar fechado para superficies admin e registrar erro operacional.
5. WHEN a aplicacao roda em desenvolvimento sem credenciais THEN o sistema SHALL permitir um modo local documentado ou exigir credenciais padrao explicitamente inseguras apenas em dev.

**Independent Test**: Subir API/frontend, tentar abrir `/admin` e disparar uma acao admin sem credenciais, confirmar `401`; repetir com credenciais e confirmar sucesso.

---

### P1: Experiencia Publica Verificavel MVP

**User Story**: Como cidadao, quero navegar documentos, licitacoes, descobertas e dinheiro publico com fonte oficial visivel para que eu consiga conferir de onde veio cada informacao.

**Why P1**: A proposta central do produto e inteligencia publica verificavel, nao apenas resumo de PDFs.

**Acceptance Criteria**:

1. WHEN o cidadao abre paginas publicas criticas (`/`, `/acervo`, `/licitacoes`, `/documento/:id`, `/descobertas`, `/transparencia`, `/sobre`) THEN o sistema SHALL renderizar dados reais da API sem controles administrativos visiveis por padrao.
2. WHEN uma tela mostra valor monetario agregado THEN o sistema SHALL exibir o periodo do valor ou contexto temporal equivalente.
3. WHEN uma tela mostra informacao derivada por IA THEN o sistema SHALL deixar claro que a fonte oficial tem prioridade e oferecer caminho para a fonte/documento original quando disponivel.
4. WHEN um dado relevante estiver incompleto por lacuna de fonte ou OCR THEN o sistema SHALL mostrar estado honesto, sem tratar como erro silencioso nem inventar valor.
5. WHEN uma fonte oficial existir (`url_pdf`, `url_origem` ou anexo) THEN o sistema SHALL expor link de verificacao na pagina de detalhe adequada.

**Independent Test**: Rodar smoke E2E nas rotas publicas e inspecionar exemplos com valor, IA, lacuna e fonte oficial.

---

### P1: Build e Smoke Test de Producao

**User Story**: Como mantenedor, quero um build de producao reproduzivel com smoke tests para que cada publicacao seja validada antes de ir ao ar.

**Why P1**: Sem build/deploy validado, o projeto continua preso ao ambiente local.

**Acceptance Criteria**:

1. WHEN `npm run build --prefix frontend` e executado THEN o sistema SHALL completar sem erro.
2. WHEN a API inicia em modo de producao com `.env` valido THEN `/api/health` SHALL responder sucesso.
3. WHEN o frontend aponta para a API de producao/staging THEN as rotas publicas criticas SHALL carregar sem erro de console bloqueante.
4. WHEN smoke tests rodam contra a instancia local/staging THEN eles SHALL cobrir pelo menos home, lista de licitacoes, detalhe de documento, descobertas e bloqueio admin.
5. WHEN o deploy e preparado THEN o runbook SHALL listar variaveis de ambiente, comandos de build/start, estrategia de banco SQLite e rollback minimo.

**Independent Test**: Executar build, iniciar API/frontend em modo equivalente a producao e rodar Playwright smoke.

---

### P2: Operacao de Dados Publicavel

**User Story**: Como operador, quero um fluxo documentado para coleta, IA, descobertas e auditoria para que a base possa ser atualizada sem depender de memoria de sessao.

**Why P2**: O produto depende de dados frescos e jobs longos; operacao precisa ser repetivel.

**Acceptance Criteria**:

1. WHEN o operador segue o runbook de atualizacao THEN o sistema SHALL executar coleta, estruturacao relevante, IA pendente, descobertas e docs de dados na ordem definida.
2. WHEN um job falha parcialmente THEN o sistema SHALL preservar dados ja persistidos e expor status/log suficiente para retentativa.
3. WHEN a atualizacao termina THEN `README.md` ou doc operacional SHALL refletir comandos e estados esperados.
4. WHEN dados do PNCP retornam vazio para Ritapolis THEN o sistema SHALL registrar ausencia sem quebrar o pipeline local.

**Independent Test**: Rodar uma atualizacao em `--dry-run` quando disponivel, validar status via `/api/admin/status` autenticado e conferir logs.

---

### P2: Cobertura Honesta e Qualidade Minima

**User Story**: Como leitor critico, quero entender quais anos e tipos de dado tem boa cobertura para que eu nao tire conclusoes falsas de uma base incompleta.

**Why P2**: A especificidade do projeto e explicitar lacunas, principalmente valores finais e OCR.

**Acceptance Criteria**:

1. WHEN uma pagina publica apresenta indicadores de cobertura THEN o sistema SHALL separar falta de fonte, falta de OCR, falta de IA e falta de valor final quando esses estados forem conhecidos.
2. WHEN `valor_final` nao existe por lacuna de fonte THEN o sistema SHALL nao apresentar proposta, estimativa ou valor de edital como homologado.
3. WHEN dados antigos tiverem menor cobertura THEN o sistema SHALL exibir essa diferenca por ano ou contexto equivalente.
4. WHEN documentos exigem OCR THEN o sistema SHALL permitir que o admin veja a fila ou contagem operacional.

**Independent Test**: Conferir exemplos reais de ano com cobertura baixa, edital sem valor final e fila OCR no painel/admin ou relatorio.

---

### P3: Preparacao para Evolucao Pos-MVP

**User Story**: Como mantenedor, quero que o MVP deixe explicito o que fica para depois para que proximas features nao sejam confundidas com bloqueadores de publicacao.

**Why P3**: Ha varias frentes promissoras, mas a publicacao precisa de foco.

**Acceptance Criteria**:

1. WHEN a especificacao for confirmada THEN tarefas futuras como notificacoes, busca semantica, OCR avancado e login completo SHALL permanecer fora do caminho critico.
2. WHEN um item fora de escopo for solicitado durante o milestone THEN ele SHALL ser registrado como futuro ou nova spec, nao misturado ao MVP.

---

## Edge Cases

- WHEN credenciais admin estao erradas THEN o sistema SHALL retornar `401` sem revelar qual campo falhou.
- WHEN `NEXT_PUBLIC_API_URL` aponta para API indisponivel THEN paginas publicas SHALL mostrar erro amigavel ou estado vazio sem quebrar a aplicacao inteira.
- WHEN o banco SQLite nao existe no ambiente de deploy THEN a API SHALL falhar com mensagem operacional clara ou executar setup explicitamente documentado, sem criar uma base vazia silenciosamente em producao.
- WHEN a Prefeitura publica documento sem PDF mas com texto oficial na pagina THEN o sistema SHALL preservar esse documento como verificavel por pagina, nao descartar como invalido.
- WHEN uma acao admin e repetida por refresh/retry THEN endpoints com efeito colateral SHALL ser idempotentes ou documentar claramente o risco e a mitigacao.
- WHEN jobs de IA ou coleta demoram mais que a janela HTTP THEN o sistema SHALL preferir fila/job/status a resposta bloqueante longa.

---

## Implicit Requirement Dimensions Sweep

| Dimension | Requirement or N/A |
| --- | --- |
| Input validation & bounds | Admin credentials, route params, action names and config payloads must be validated before side effects. |
| Failure / partial-failure states | Jobs and public pages must degrade with visible state; failed IA/coleta must not corrupt persisted facts. |
| Idempotency / retry / duplicate handling | Operational actions should be safe to retry where existing scripts support it; non-idempotent actions need runbook warnings. |
| Auth boundaries & rate limits | Basic Auth protects admin UI and operational APIs; public read APIs remain unauthenticated. Rate limits are N/A for MVP unless deploy platform requires them. |
| Concurrency / ordering | Data update runbook defines ordering for coleta -> estrutura -> IA -> descobertas -> docs; concurrent manual runs should be avoided or guarded. |
| Data lifecycle / expiry | No deletion/TTL in MVP; backups and SQLite persistence strategy are required for deploy. |
| Observability | Health endpoint, admin status, logs and smoke-test output are required evidence for release. |
| External-dependency failure | PNCP empty responses, Prefeitura/Camara failures and AI provider errors must be handled without breaking public browsing. |
| State-transition integrity | Admin product review, alert config/generation and IA job states must not transition from public unauthenticated requests. |

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| PUB-01 | P1: Publicacao Segura do Admin | Design | Pending |
| PUB-02 | P1: Experiencia Publica Verificavel | Design | Pending |
| PUB-03 | P1: Build e Smoke Test de Producao | Design | Pending |
| PUB-04 | P2: Operacao de Dados Publicavel | Design | Pending |
| PUB-05 | P2: Cobertura Honesta e Qualidade Minima | Design | Pending |
| PUB-06 | P3: Preparacao para Evolucao Pos-MVP | Design | Pending |

**Coverage:** 6 total, 0 mapped to tasks, 6 unmapped until Design/Tasks.

---

## Success Criteria

- [ ] Todas as rotas publicas criticas carregam dados reais sem controles admin visiveis por padrao.
- [ ] Todas as rotas/admin APIs protegidas rejeitam acesso sem credenciais.
- [ ] Build de frontend e testes smoke passam em ambiente local equivalente a producao.
- [ ] Runbook de deploy e operacao existe com variaveis, comandos, banco e rollback.
- [ ] Pelo menos um exemplo real de fonte oficial, lacuna de valor, lacuna OCR e narrativa IA e validado manualmente.
