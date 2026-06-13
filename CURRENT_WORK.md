# Current Work — Monitor Ritápolis

Foco operacional imediato. Atualizar sempre que uma fase for concluída ou a prioridade mudar.

Atualizado em: 2026-06-10 — Plano de melhoria de conteúdo (v0.9). Foco: integridade, unificação com IA e redução de redundância **antes** de publicar.

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
- [ ] 3.3 Normalização de produtos para comparação histórica de preço unitário
- [ ] 3.4 Refinar os 57 "Outros" de categoria com IA (keyword → IA só no resíduo)

### Fase 4 — Arquitetura de informação e UX
- [ ] 4.1 Fundir `/temas` em filtro de `/licitacoes`; `/analises` vira seção de `/inteligencia`
- [ ] 4.2 Navegação enxuta: Início · Licitações · Fornecedores · Dinheiro público · Acervo · Sobre
- [ ] 4.3 Página do processo como hub único (resumo vs. análise rotulados; pagamentos vinculados)
- [ ] 4.4 Página pública de cobertura honesta (% com vencedor/resumo/valor por ano)

### Fase 5 — Publicação
- [ ] 5.1 Basic Auth `/admin/*`
- [ ] 5.2 Testes de parser pendentes (Prioridade 1 do CLAUDE.md) antes do deploy
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
