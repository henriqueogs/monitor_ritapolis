# Current Work

## Monitor Ritapolis

Este arquivo registra o foco operacional imediato do projeto. Ele deve ser atualizado sempre que uma rodada de trabalho for concluida ou quando a prioridade mudar.

Atualizado em: 2026-05-15.

---

## Andamento

- [x] Criado `CURRENT_WORK.md` como foco operacional da v0.2.
- [x] Adicionada paginacao em `/documentos`.
- [x] Adicionada paginacao em `/licitacoes`.
- [x] Links de ano em `/documentos` preservam filtros ativos.
- [x] Adicionada opcao manual para atualizar coleta pela home.
- [x] API de atualizacao manual criada com trava contra coleta concorrente.
- [x] Teste real da atualizacao da Camara concluido via API.
- [x] Mapeado e corrigido problema de resumo do documento `17`.
- [x] Padronizada politica de operacao de IA para definir modo direto/chunking.
- [x] Tela `/ia` ampliada para acompanhar fila, modo, chunks, duracao e erros.
- [x] Home ajustada para priorizar documentos recentes do ano corrente.
- [x] Registrada decisao de separar area publica de area administrativa.
- [x] Suporte inicial a `.docx` em anexos oficiais da Prefeitura.
- [x] Documento `44` reprocessado com extracao de texto via `mammoth`.
- [x] Suporte inicial a `.doc` em anexos oficiais antigos da Prefeitura.
- [x] Documento `478` reprocessado com extracao de texto via `word-extractor`.
- [x] Corrigida referencia do botao de fonte: paginas genericas da Prefeitura nao aparecem mais como pagina especifica do documento.
- [x] Incorporado `redesign/plano-ux-ui.md` como referencia de produto para a retomada.
- [x] Rechecado status local de dados e IA em 2026-05-14.
- [ ] Validar visualmente home, documentos, licitacoes, detalhe e IA em desktop.
- [ ] Validar visualmente fluxo principal em mobile.
- [ ] Levantar amostras de `sem_data`, `sem_pdf`, `erro_pdf` e `documento_publico`.
- [x] Definir lote operacional padrao de IA (2026 completo).
- [x] Concluida analise completa do projeto e identificacao dos proximos passos.
- [x] Rodado diagnostico de qualidade dos dados (73 sem_data, 103 sem_pdf, 3 erro_pdf, 30 doc_publico).
- [x] Identificadas 96 duplicatas na base (~16%) — coletor antigo `ws_consulta` vs. novo `/pagina/`.
- [x] Validada API (health, painel-cidadao, documentos, IA, frontend) — todos operacionais.
- [x] Executada deduplicacao completa: 53 duplicatas + 12 paginas navegacao Camara removidas.
- [x] Backup criado em `data/ritapolis-backup-antes-saneamento.db`.
- [x] Corrigidas 5 datas de publicacao extraidas do texto completo dos documentos.
- [x] 3 erro_pdf investigados: PDFs antigos, escaneados ou .rar — fora de escopo.
- [x] Lote IA 2026 completo: 8/8 documentos resumidos (confianca media 0.84).
- [x] Criado plano de refatoracao arquitetural do frontend e backend em `ARCHITECTURE_REFACTOR_PLAN.md`.
- [ ] Conferir tudo que ja foi gerado/exibido e remover redundancias.
- [x] Consolidada a home em uma lista unica de ultimas atualizacoes por data.
- [x] Adicionado controle para ativar/desativar modo admin na interface.
- [x] Removido `texto_completo` dos payloads de lista de documentos e licitacoes.
- [x] Refatorada a home como primeira prova de arquitetura por pasta.
- [x] Todas as rotas do frontend passaram a ter `page.js`, `index.js`, `styles.module.css` e `page.test.js`.
- [x] Componentizados blocos locais de home, documentos, licitacoes, analises, temas e estatisticas.
- [x] Componentizado o detalhe de documento em secoes locais da rota.
- [x] Componentizada a tela de IA em paineis locais de filtros, cobertura, fila e providers.
- [x] Reduzida dependencia de `globals.css` em `documento/[id]` e `ia`, migrando estilos especificos para CSS Modules.
- [x] Migrados `content-grid`, `status-list`, `status-row`, `stats-grid` e `stat-box` restantes para CSS Modules das rotas.
- [x] `/cobertura` passou a tratar falha do site externo da Prefeitura como estado indisponivel em vez de erro 500.
- [x] Corrigido mapa de cobertura da Prefeitura para usar URLs publicas `/pagina/6668/editais` e `/pagina/9656/Editais%202`.
- [x] Cobertura da Prefeitura agora retorna areas monitoradas, status por area e contagem de documentos ja conhecidos por area.
- [x] Criada verificacao automatica da Prefeitura ao abrir o portal, usando o campo "Ultima atualizacao em" das areas oficiais.
- [x] Sincronizacao automatica ficou isolada em `src/coletas/prefeitura-sync.js` e chamada pela home via componente `PrefeituraAutoSync`.
- [x] Ajustada leitura da ultima atualizacao para seguir o AJAX real do site: `Pagina.php` -> `Cadastro_Generico.php`.
- [x] Coleta automatica da Prefeitura validada em 2026-05-15: site marcado como desatualizado, coleta iniciada, 532 itens atualizados e 0 erros.
- [x] Otimizada a cobertura da Prefeitura para respeitar o limite durante a coleta e usar cache curto, evitando carregamento de dezenas de segundos.

---

## Foco atual

**Retomada v0.2 -> v0.3**

Concluir a estabilizacao da experiencia publica atual e preparar a migracao gradual para a visao de inteligencia publica verificavel descrita em `redesign/plano-ux-ui.md`.

Prioridade pratica:

1. validar e corrigir o fluxo publico existente;
2. separar melhor area publica e area administrativa;
3. deixar qualidade, origem e disponibilidade dos dados sempre visiveis;
4. transformar `/`, `/analises`, `/acervo`, `/transparencia` e `/admin/*` em direcao de produto;
5. preparar a base para PNCP e transparencia, sem iniciar integracoes novas antes da validacao da experiencia atual.

---

## Planos ativos

### Plano 1 - Fechamento da v0.2 publica

Objetivo: deixar a experiencia atual confiavel para consulta cidada.

Entregas:

- validar visualmente paginas publicas em desktop e mobile;
- corrigir quebras de layout, textos sobrepostos e estados vazios confusos;
- garantir que documento, arquivo oficial, fonte, texto extraido, resumo IA e alertas de qualidade estejam claros;
- manter paginacao e filtros previsiveis em documentos e licitacoes.

### Plano 2 - Separacao publica/admin

Objetivo: evitar mistura entre produto cidadao e operacao interna.

Direcao de rotas:

- `/` vira painel publico de acontecimentos e sinais recentes;
- `/documentos` permanece por compatibilidade, mas evolui para `/acervo`;
- `/licitacoes` vira recorte de acervo e tema de contratacoes;
- `/estatisticas` evolui para `/transparencia`;
- `/ia`, `/cobertura` e rotinas de coleta migram para `/admin/*`;
- `/analises` fica publica apenas quando a leitura tiver evidencias, fonte e limites claros.
- o modo admin deve poder ser ativado/desativado na interface sem misturar navegacao operacional com a experiencia publica.

### Plano 3 - Qualidade dos dados

Objetivo: transformar lacunas em informacao visivel e rastreavel.

Fila imediata:

- revisar amostras sem data;
- revisar amostras sem arquivo oficial;
- investigar erros de extracao de arquivo oficial;
- revisar registros `documento_publico`;
- trocar linguagem publica de "PDF" para "arquivo oficial" onde fizer sentido.

### Plano 4 - Rotina inicial de IA

Objetivo: aumentar cobertura de resumos com controle de qualidade.

Politica inicial:

- lotes pequenos;
- prioridade para 2026 e 2025;
- prioridade para editais;
- documentos curtos antes de arquivos longos;
- revisao humana de amostra apos cada lote;
- manter NVIDIA como provider padrao ate haver comparacao em amostra fixa.

### Plano 5 - Preparacao v0.3

Objetivo: abrir caminho para cobertura e confiabilidade sem perder auditabilidade.

Entram depois da validacao v0.2:

- PNCP;
- portal de transparencia;
- deduplicacao entre fontes;
- entidades de fornecedor, orgao, processo e documento relacionado;
- snapshots de cobertura por data.

### Plano 6 - Arquitetura e refatoracao do codigo

Objetivo: transformar a organizacao do codigo em uma base central de arquitetura do projeto, reduzindo arquivos gigantes e facilitando evolucao segura.

Diretrizes:

- cada pagina deve ter sua propria pasta;
- cada pasta de pagina deve separar entrada, estilos e testes, usando a convencao:
  - `index`;
  - `styles`;
  - `test`;
- componentes compartilhados devem sair das paginas e viver em uma camada comum;
- paginas devem orquestrar dados e composicao, nao concentrar regra de negocio, markup extenso e estilo;
- seguir principios SOLID na separacao de responsabilidades;
- evitar duplicacao entre telas publicas e administrativas;
- reduzir `globals.css` gradualmente, migrando estilos para modulos/arquivos por contexto;
- preservar comportamento atual antes de refatorar visualmente.

Primeiro passo recomendado:

- mapear arquivos grandes e responsabilidades misturadas;
- criar uma proposta de arquitetura alvo para `frontend/app`;
- definir padrao de teste por pagina e por componente;
- migrar uma pagina pequena como prova antes de aplicar no restante.

Status:

- plano arquitetural criado em `ARCHITECTURE_REFACTOR_PLAN.md`;
- primeira redundancia tecnica corrigida: listas nao retornam `texto_completo`, apenas detalhes devem carregar texto integral;
- home migrada para `frontend/app/_home/` com `index.js`, `styles.module.css`, `page.test.js` e componentes locais;
- todas as rotas de `frontend/app` agora seguem a convencao minima `page.js` + `index.js` + `styles.module.css` + `page.test.js`;
- `page.js` virou ponte curta em todas as rotas;
- segunda rodada de componentizacao aplicada em `documento/[id]` e `ia`;
- estilos especificos de `documento/[id]` e `ia` migrados para CSS Modules;
- estilos globais de grids/status/metrica migrados para CSS Modules nas telas publicas e administrativas que ainda dependiam deles;
- proximo alvo arquitetural e revisar `globals.css` para separar estilos realmente compartilhados de componentes reaproveitaveis;
- rota `/cobertura` agora permanece acessivel quando a consulta externa da Prefeitura falha, exibindo indisponibilidade da verificacao;
- rota `/cobertura` agora mostra mapa verificavel das areas oficiais da Prefeitura e usa endpoints `ws_consulta` apenas como mecanismo tecnico de extracao;
- home chama uma verificacao apartada da Prefeitura ao abrir o portal; se a data publica do site for mais recente que a ultima coleta local, a coleta da Prefeitura e iniciada pela trava compartilhada de atualizacao;
- a referencia de atualizacao da Prefeitura vem do bloco `Cadastro_Generico` carregado pelo site oficial, nao do HTML inicial da URL publica;
- API e frontend foram reiniciados e servem o novo contrato em HTTP.
- cobertura da Prefeitura nao deve varrer todos os registros externos para abrir a pagina quando `limite` for menor que o total do site.

### Plano 7 - Conferencia e reducao de redundancias

Objetivo: revisar o que ja foi gerado, o que esta sendo exibido e remover duplicacoes que confundem a experiencia publica.

Fila imediata:

- auditar home, analises, temas, acervo, licitacoes, transparencia, cobertura, IA e admin;
- listar blocos repetidos entre telas publicas e operacionais;
- conferir se todos os indicadores exibidos usam dados reais;
- remover listas duplicadas na home quando uma lista unica por data resolver melhor;
- revisar copy, estados vazios e links para evitar promessas acima da cobertura atual;
- registrar o que fica publico, o que vai para admin e o que deve sair.

Criterio de aceite:

- cada tela tem funcao clara;
- dados demonstrativos nao aparecem como dado real;
- o usuario nao ve duas leituras concorrentes para o mesmo conjunto de documentos;
- redundancias sao removidas antes de novas funcionalidades grandes.

---

## Estado de partida

Ja existe:

- API Express com documentos, licitacoes, estatisticas, painel cidadao, cobertura e IA;
- frontend Next.js com home, documentos, licitacoes, detalhe, estatisticas, cobertura, analises e IA;
- extracao de texto para PDF, DOCX e DOC em anexos oficiais da Prefeitura;
- metadados por documento:
  - `indicadores.tem_pdf`;
  - `indicadores.tem_texto_extraido`;
  - `indicadores.tem_resumo_ai`;
  - `indicadores.dados_incompletos`;
  - `qualidade_alertas`;
  - `origem_resumo`;
- 592 documentos locais;
- 521 editais/licitacoes locais;
- 564 registros da Prefeitura;
- 28 registros da Camara;
- 16 resumos IA prontos e 436 pendentes entre 452 documentos elegiveis.

Estado de qualidade verificado em 2026-05-14:

- 73 documentos sem data de publicacao;
- 103 documentos sem arquivo oficial identificado em `url_pdf`;
- 3 documentos com `status_coleta = erro_pdf`;
- 30 documentos classificados como `documento_publico`.

Ultimo teste real de coleta:

- data: 2026-05-13;
- fonte: Camara;
- resultado: `ok`;
- itens novos: 9;
- itens atualizados: 88;
- itens com erro: 0;
- observacao: uma primeira tentativa sem rede externa falhou por bloqueio do sandbox (`connect EACCES`), e a repeticao com acesso externo passou.

Ultima correcao de IA:

- documento: `17`;
- problema: o texto tinha 57.221 caracteres e era enviado em modo direto, causando `Request timed out`;
- efeito colateral: um job ficou temporariamente preso como `processando`;
- ajuste: textos acima do tamanho de chunk agora usam chunking mesmo abaixo de `AI_MAX_CHARS_DIRECT`;
- ajuste: a API recupera jobs antigos presos antes de retornar detalhe ou iniciar novo resumo;
- resultado validado: resumo `ok`, confianca `0.9`, modo previsto `chunking`, 3 chunks.

Padrao atual de interacao com IA:

- toda chamada de resumo passa pela mesma politica em `src/ai/operation-policy.js`;
- documentos pequenos usam modo `direto`;
- documentos acima do limite direto usam `chunking`;
- jobs registram status, tentativas, inicio, fim, erro e resumo associado;
- a tela `/ia` deve ser a referencia para saber o que rodou, onde deu erro e quando ocorreu;
- novas funcionalidades de IA devem reaproveitar esse padrao antes de criar novas filas ou telas paralelas.

Separacao publica e administrativa:

- a pagina inicial deve ser pensada para o usuario final;
- por padrao, a home mostra documentos recentes do ano corrente;
- estatisticas internas, qualidade da base, fila de IA e acoes de atualizacao devem migrar futuramente para area administrativa;
- enquanto nao houver autenticacao, esses blocos podem existir na interface, mas devem ser tratados como observacao interna dos dados;
- nao misturar linguagem de produto cidadao com linguagem operacional de administracao da plataforma.

Referencia de fonte oficial:

- para documentos antigos da Prefeitura, `url_origem` pode apontar para uma pagina tecnica antiga de consulta, como `INT_PAG=6668` ou `INT_PAG=9656`;
- novas coletas da Prefeitura devem salvar `url_origem` com a pagina publica correspondente, como `/pagina/6668/editais` ou `/pagina/9656/Editais%202`;
- paginas tecnicas `ws_consulta` nao devem ser apresentadas como "pagina da fonte" do documento;
- a acao primaria do detalhe deve abrir o arquivo oficial quando `url_pdf` estiver disponivel;
- a pagina da fonte so deve aparecer quando houver uma URL especifica do documento ou modulo.

Arquivos oficiais nao PDF:

- anexos `.docx` devem ser extraidos com `mammoth`;
- anexos `.doc` antigos devem ser extraidos com `word-extractor`;
- anexos `.doc.pdf` devem continuar sendo tratados como PDF, pois a extensao final e a que define o formato real;
- falhas de arquivos Word devem aparecer como erro especifico do arquivo oficial, nao como falha generica de PDF;
- na interface publica, usar "arquivo oficial" em vez de assumir que todo anexo e PDF;
- campos internos `url_pdf`, `sem_pdf` e `erro_pdf` permanecem por compatibilidade ate uma futura migracao de schema;
- documento `44` validado: `publicacao_dispensa_e_contrato.docx`, 705 caracteres extraidos, status `ok`.
- documento `478` validado: `EDITAL PARA CONTRATACAO DE MONITORES (1).doc`, 10.020 caracteres extraidos, status `ok`.

---

## Proximos passos imediatos

### 1. Validar experiencia publica

- Abrir a home em desktop e mobile.
- Conferir se os blocos de fonte, anos, qualidade e resumos IA estao claros.
- Validar `/documentos?ano=2026`.
- Validar `/licitacoes?ano=2026`.
- Validar um detalhe com resumo IA, por exemplo `/documento/2`.
- Validar um detalhe sem resumo IA.
- Validar rotas novas ou em transicao: `/acervo`, `/analises`, `/temas`, `/transparencia`, `/sobre` e `/admin`.

Criterio de aceite:

- usuario consegue entender de onde veio o documento;
- usuario percebe se ha arquivo oficial, texto extraido e resumo IA;
- dados incompletos aparecem como alerta;
- nenhuma pagina principal apresenta quebra visual ou texto sobreposto.

### 2. Organizar rotas publicas e administrativas

- Manter `/documentos` e `/licitacoes` funcionais por compatibilidade.
- Consolidar `/acervo` como consulta principal.
- Mover linguagem operacional de IA, coletas, cobertura e qualidade para `/admin/*`.
- Manter dados reais nas paginas publicas; usar mock apenas em `redesign/prototype`, rotulado como demonstrativo.

Criterio de aceite:

- usuario publico nao precisa entender fila, job ou coleta para consultar documentos;
- operacao interna tem lugar proprio;
- nenhuma informacao demonstrativa aparece como dado real.

### 3. Revisar qualidade dos dados principais

- Levantar amostra dos 73 registros sem data.
- Levantar amostra dos 103 registros sem arquivo oficial.
- Investigar os 3 casos `erro_pdf`.
- Revisar os 30 tipos `documento_publico`.
- Registrar padroes encontrados antes de corrigir em massa.

Criterio de aceite:

- existe uma lista curta dos problemas mais comuns;
- fica claro o que e erro de coleta, ausencia real de PDF ou limitacao da fonte;
- nenhuma correcao manual deve apagar a rastreabilidade da fonte original.

### 4. Definir rotina inicial de IA

- Usar lotes pequenos.
- Priorizar 2026 e 2025.
- Priorizar `tipo=edital`.
- Priorizar documentos curtos antes de PDFs grandes.
- Revisar manualmente uma amostra a cada lote.

Comando de planejamento:

```bash
npm run ai:resumir-pendentes -- --dry-run --ano=2026 --tipo=edital --limite=5 --max-chars=20000
```

Comando de execucao segura:

```bash
npm run ai:resumir-pendentes -- --ano=2026 --tipo=edital --limite=1 --max-chars=20000
```

Criterio de aceite:

- lote pequeno roda sem erro;
- resumo salvo aparece em `/ia`;
- detalhe do documento mostra resumo, modelo, confianca e hash compativel;
- amostra humana nao encontra extrapolacao grave.

### 5. Atualizar roadmap depois da validacao

- Sincronizar `DEVELOPMENT_PLAN.md` com o fechamento da v0.2.
- Decidir quais partes do `redesign/plano-ux-ui.md` entram direto no frontend real.
- Promover itens de v0.3 apenas quando a experiencia publica estiver validada.

Criterio de aceite:

- `DEVELOPMENT_PLAN.md` continua como roadmap mestre;
- `CURRENT_WORK.md` continua sendo o quadro de foco imediato;
- proximas frentes entram em ordem, sem misturar prototipo, mock e dado real.

---

## Fora de escopo agora

Nao iniciar ainda:

- PNCP;
- portal de transparencia da Prefeitura;
- migracao para PostgreSQL;
- autenticacao administrativa;
- deploy definitivo;
- refatoracao grande de schema;
- troca de modelo de IA sem antes definir amostra fixa.

Esses itens entram depois que a v0.2 estiver validada visual e operacionalmente.

---

## Comandos uteis

Subir API:

```bash
npm run api
```

Subir frontend:

```bash
npm run dev --prefix frontend
```

Subir tudo junto:

```bash
npm start
```

Build do frontend:

```bash
npm run build --prefix frontend
```

Status dos resumos IA:

```bash
npm run ai:status
npm run ai:status -- --ano=2026 --tipo=edital
```

Checar portas no Windows:

```powershell
netstat -ano | findstr ":3000 :3001"
```

---

## Endpoints para validar

```text
GET /api/health
GET /api/painel-cidadao
GET /api/documentos?ano=2026
GET /api/licitacoes?ano=2026
GET /api/ia/resumos/status
GET /api/ia/resumos/jobs
GET /api/coletas/atualizacao/status
POST /api/coletas/atualizar
POST /api/coletas/sincronizar-prefeitura
```

---

## Paginas para validar

```text
/
/documentos
/documentos?ano=2026
/licitacoes
/licitacoes?ano=2026
/documento/2
/acervo
/analises
/temas
/transparencia
/sobre
/admin
/admin/ia
/ia
/cobertura
```

---

## Regras de trabalho

- `DEVELOPMENT_PLAN.md` e o roadmap vivo.
- `CURRENT_WORK.md` e o foco imediato.
- `ARCHITECTURE_REFACTOR_PLAN.md` e o plano central de arquitetura e refatoracao.
- `ACOMPANHAMENTO_RESUMOS_IA_PDFS.md` continua sendo o log detalhado da IA.
- `SPEC_monitor_ritapolis.md` e historico e nao deve guiar decisoes atuais sem comparacao com o estado real.
- O frontend deve continuar consumindo apenas a API propria.
- A fonte oficial e sempre mais importante que o resumo IA.
