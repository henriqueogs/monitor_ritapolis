# Plano de Desenvolvimento

## Monitor Ritapolis

Este e o documento mestre de acompanhamento evolutivo da plataforma. Ele registra o estado real do projeto, a direcao de produto e a ordem recomendada dos proximos passos.

Atualizado em: 2026-05-13.

---

## 1. Diagnostico atual

O Monitor Ritapolis ja passou do MVP minimo. A plataforma possui coleta real, banco local, API propria, frontend publico e uma operacao inicial de resumos de PDF com IA.

Estado observado no banco local:

- 583 documentos cadastrados;
- 520 licitacoes/editais;
- 564 registros da Prefeitura;
- 19 registros da Camara;
- coleta da Prefeitura e da Camara validada em 2026-05-12;
- IA operacional com NVIDIA, fila assincrona e jobs de resumo;
- cobertura de IA ainda baixa: 13 documentos resumidos, 0 com erro e 435 pendentes entre documentos elegiveis.

Documentos de referencia:

- `README.md`: guia operacional atual.
- `DEVELOPMENT_PLAN.md`: documento mestre e roadmap vivo.
- `ARCHITECTURE_REFACTOR_PLAN.md`: plano central de arquitetura e refatoracao.
- `SPEC_monitor_ritapolis.md`: especificacao historica do MVP original.
- `ACOMPANHAMENTO_RESUMOS_IA_PDFS.md`: log operacional detalhado da camada de IA.
- `IMPLEMENTACAO_RESUMOS_IA_PDFS.md`: desenho e historico de implementacao dos resumos.

---

## 2. O que ja esta implementado

### Backend, dados e coleta

- Backend Node.js com API Express.
- Banco SQLite local com tabelas de documentos, fontes relacionadas, licitacoes, logs de coleta, resumos IA e jobs IA.
- Coletor da Prefeitura baseado no site oficial e nos cadastros genericos.
- Coletor da Camara baseado no portal SH3.
- Persistencia com upsert, hash de conteudo e fontes relacionadas.
- Logs de coleta em `coletas_log`.
- Parsers iniciais de PDF, licitacao e decreto.
- Extracao inicial de `.docx` e `.doc` para anexos oficiais da Prefeitura.

### API

Endpoints publicos e operacionais ja disponiveis:

- `GET /api/health`
- `GET /api/documentos`
- `GET /api/documentos/:id`
- `GET /api/licitacoes`
- `GET /api/estatisticas`
- `GET /api/painel-cidadao`
- `GET /api/coletas/log`
- `GET /api/cobertura/prefeitura`
- `GET /api/analises/resumos`
- `GET /api/ia/health`
- `GET /api/ia/resumos/status`
- `GET /api/ia/resumos/jobs`
- `GET /api/ia/resumos/jobs/:id`
- `POST /api/documentos/:id/resumir`
- `POST /api/ia/resumos/jobs/lote`
- `POST /api/ia/resumos/jobs/recover`

As respostas de documentos agora incluem metadados de confianca para o frontend:

- `indicadores.tem_pdf`
- `indicadores.tem_texto_extraido`
- `indicadores.tem_resumo_ai`
- `indicadores.dados_incompletos`
- `qualidade_alertas`
- `origem_resumo`

### Frontend

Frontend Next.js com paginas:

- `/`: painel cidadao;
- `/documentos`: acervo com filtros;
- `/licitacoes`: listagem de licitacoes e compras;
- `/documento/[id]`: detalhe com fonte oficial, campos principais, texto extraido e resumo IA;
- `/estatisticas`: painel de indicadores;
- `/cobertura`: comparacao inicial da cobertura da Prefeitura;
- `/analises`: analises derivadas dos resumos IA;
- `/ia`: acompanhamento de cobertura e jobs de IA.

### IA

- Provider NVIDIA via endpoint OpenAI-compatible.
- Contrato de resumo validado com Zod.
- Tabela propria `documentos_resumos_ai`.
- Cache por `documento_id + texto_hash + contrato_versao`.
- Chunking para documentos grandes.
- Fila assincrona em SQLite para resumos.
- Worker manual e disparo em background pela API.
- Recuperacao de jobs presos em `processando`.
- Frontend mostra resumo, confianca, modelo, hash e aviso de que IA e apoio, nao fonte oficial.

---

## 3. Direcao de produto

Prioridade imediata: **Produto cidadao**.

Objetivo da proxima evolucao: transformar a base tecnica em uma plataforma publica clara, confiavel e facil de consultar, sem perder auditabilidade.

Principios:

- a fonte oficial sempre vem antes do resumo;
- dados incompletos devem aparecer como alerta, nao como falha escondida;
- busca e filtros sao o fluxo principal de uso;
- a linguagem deve ser compreensivel para pessoas sem conhecimento tecnico de administracao publica;
- IA e uma camada auxiliar de leitura, nunca fonte da verdade.
- a home publica deve priorizar documentos recentes do ano corrente;
- estatisticas internas, qualidade da base, fila de IA e atualizacao de coleta pertencem a futura area administrativa.

---

## 4. Roadmap por versao

### v0.2 - Produto cidadao

Objetivo: consolidar a experiencia publica.

Itens:

- reorganizar a home como painel de consulta;
- destacar anos, tipos, fontes e alertas de qualidade;
- melhorar listas de documentos e licitacoes com sinais de PDF, texto extraido, resumo IA e dados incompletos;
- deixar o detalhe do documento mais explicito sobre fonte oficial, limitações e confianca;
- revisar linguagem de filtros, estados vazios e avisos.

Criterios de pronto:

- usuario encontra documentos por ano, tipo e fonte;
- cada documento deixa clara a fonte oficial;
- registros sem PDF, sem data ou com erro de PDF aparecem sinalizados;
- resumo IA mostra modelo, data, confianca e compatibilidade com o texto atual.

### v0.3 - Cobertura e confiabilidade

Objetivo: ampliar fontes e reduzir lacunas.

Itens:

- implementar PNCP como fonte prioritaria para licitacoes;
- implementar portal de transparencia da Prefeitura;
- melhorar cobertura da Camara;
- criar deduplicacao entre site oficial, PNCP e transparencia;
- salvar snapshots de cobertura por data;
- comparar ausentes por ano e fonte.

Criterios de pronto:

- licitacoes aparecem com mais de uma origem quando houver correspondencia;
- lacunas de cobertura ficam mensuraveis;
- registros duplicados sao agrupados ou relacionados sem apagar rastreabilidade.

### v0.4 - Operacao continua

Objetivo: tirar o sistema do modo manual.

Itens:

- scheduler de coletas por fonte;
- travas para evitar coletas concorrentes;
- backup do SQLite;
- politica de logs;
- worker de IA como processo proprio em producao;
- checklist de deploy.

Criterios de pronto:

- coletas rodam automaticamente;
- jobs presos sao recuperados;
- banco pode ser restaurado;
- ambiente de producao tem rotina clara de operacao.

### v0.5 - Inteligencia e analise

Objetivo: expandir IA com controle de qualidade e custo.

Itens:

- rodar lotes pequenos e priorizados de IA;
- revisar amostras humanas por tipo de documento;
- comparar modelos NVIDIA em uma amostra fixa;
- planejar fallback futuro para PDFs longos;
- ampliar analises de valores, datas, partes envolvidas e riscos.

Criterios de pronto:

- ha politica de lote, timeout e custo;
- qualidade dos resumos foi revisada por amostra;
- casos de baixa confianca ficam visiveis;
- modelo escolhido equilibra velocidade, JSON valido e fidelidade.

---

## 5. Pendencias reais

### Produto cidadao

- validar visualmente as paginas principais em desktop e mobile;
- melhorar paginacao preservando filtros;
- criar rotas amigaveis por ano, como `/documentos/2026`;
- revisar se a home deve mostrar ultimos documentos por ano em vez de lista unica;
- destacar documentos com resumo IA disponivel sem esconder documentos sem IA.
- separar visualmente area publica de observacao interna ate existir area administrativa.
- usar "arquivo oficial" na interface publica, pois nem todo anexo e PDF.

### Qualidade de dados

- reduzir registros `sem_data`;
- revisar registros `sem_pdf`;
- investigar os 7 casos `erro_pdf`;
- ampliar validacao de anexos `.doc` antigos extraidos com `word-extractor`;
- melhorar classificacao de tipos como `documento_publico`;
- melhorar extracao de modalidade, objeto, data de abertura, valor estimado e status.

### Fontes

- ampliar cobertura da Camara;
- implementar PNCP;
- implementar portal de transparencia;
- cruzar processos entre fontes;
- diferenciar versoes, anexos e documentos relacionados.

### IA

- definir lote operacional recomendado;
- priorizar 2026 e 2025, editais e documentos curtos;
- revisar manualmente amostras por tipo;
- avaliar modelo NVIDIA atual;
- registrar geracoes manuais no banco, se auditoria exigir.

### Operacao

- criar scheduler;
- definir backup;
- preparar deploy;
- decidir quando migrar de SQLite para PostgreSQL.

---

## 6. Decisoes atuais

- SQLite permanece no curto prazo.
- Nao havera autenticacao administrativa nesta etapa.
- O frontend continua consumindo apenas a API propria.
- NVIDIA permanece como provider padrao de IA.
- PNCP e portal de transparencia entram depois da consolidacao da experiencia publica.
- `ACOMPANHAMENTO_RESUMOS_IA_PDFS.md` continua sendo o log detalhado da IA.
- `SPEC_monitor_ritapolis.md` fica como documento historico do MVP, nao como estado atual.
- A separacao futura entre area publica e area administrativa e uma decisao de produto registrada.

---

## 7. Validacao recomendada

Comandos:

```bash
npm run build --prefix frontend
npm run ai:status
```

Endpoints:

```text
GET /api/health
GET /api/painel-cidadao
GET /api/documentos?ano=2026
GET /api/licitacoes?ano=2026
GET /api/ia/resumos/status
```

Fluxos no navegador:

- home;
- acervo de documentos;
- licitacoes;
- detalhe com resumo IA;
- detalhe sem resumo IA;
- pagina `/ia`.

Dados a conferir:

- total por fonte, tipo e ano;
- documentos sem PDF;
- documentos com erro de PDF;
- documentos sem data;
- compatibilidade de hash dos resumos IA.
