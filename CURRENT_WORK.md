# Current Work

## Monitor Ritapolis

Este arquivo registra o foco operacional imediato do projeto. Ele deve ser atualizado sempre que uma rodada de trabalho for concluida ou quando a prioridade mudar.

Atualizado em: 2026-05-13.

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
- [ ] Validar visualmente home, documentos, licitacoes, detalhe e IA em desktop.
- [ ] Validar visualmente fluxo principal em mobile.
- [ ] Levantar amostras de `sem_data`, `sem_pdf`, `erro_pdf` e `documento_publico`.
- [ ] Definir lote operacional padrao de IA.

---

## Foco atual

**v0.2 - Produto cidadao**

Transformar a base tecnica ja existente em uma plataforma publica clara, confiavel e facil de consultar.

Prioridade pratica:

1. melhorar a experiencia de consulta;
2. deixar qualidade e origem dos dados sempre visiveis;
3. revisar visualmente as paginas principais;
4. preparar a base para a proxima frente de cobertura, sem iniciar PNCP ainda.

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
- 520 licitacoes/editais;
- 13 resumos IA prontos e 435 pendentes entre documentos elegiveis.

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

- para documentos da Prefeitura, `url_origem` pode apontar para uma pagina generica de consulta, como `INT_PAG=6668` ou `INT_PAG=9656`;
- essas paginas genericas nao devem ser apresentadas como "pagina da fonte" do documento;
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

Criterio de aceite:

- usuario consegue entender de onde veio o documento;
- usuario percebe se ha PDF, texto extraido e resumo IA;
- dados incompletos aparecem como alerta;
- nenhuma pagina principal apresenta quebra visual ou texto sobreposto.

### 2. Melhorar navegacao por ano e filtros

- [x] Preservar filtros ao navegar entre anos.
- [x] Melhorar paginacao mantendo `ano`, `tipo`, `fonte`, `q` e `qualidade`.
- Avaliar rota futura `/documentos/2026`, mas nao implementar se a paginacao atual ainda nao estiver firme.

Criterio de aceite:

- filtrar por ano nao faz o usuario perder contexto;
- busca e filtros continuam previsiveis;
- pagina de documentos permanece util em listas grandes.

### 3. Revisar qualidade dos dados principais

- Levantar amostra de registros `sem_data`.
- Levantar amostra de registros `sem_pdf`.
- Investigar os 7 casos `erro_pdf`.
- Revisar tipos `documento_publico`.

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
/ia
/cobertura
```

---

## Regras de trabalho

- `DEVELOPMENT_PLAN.md` e o roadmap vivo.
- `CURRENT_WORK.md` e o foco imediato.
- `ACOMPANHAMENTO_RESUMOS_IA_PDFS.md` continua sendo o log detalhado da IA.
- `SPEC_monitor_ritapolis.md` e historico e nao deve guiar decisoes atuais sem comparacao com o estado real.
- O frontend deve continuar consumindo apenas a API propria.
- A fonte oficial e sempre mais importante que o resumo IA.
