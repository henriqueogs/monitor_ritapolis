# Plano de Desenvolvimento — Monitor Ritápolis

Roadmap mestre do projeto. Registra o que o produto é, o que foi construído e o que vem a seguir.

Atualizado em: 2026-06-08 (v0.7 — Schedulers + integração PNCP v3).

---

## 1. O que é este projeto

O Monitor Ritápolis é uma plataforma de inteligência pública verificável para o município de Ritápolis/MG. Coleta documentos oficiais da Prefeitura e da Câmara, estrutura os dados com parsers determinísticos e enriquece com IA — sempre com rastreabilidade da fonte original.

**O produto não é um repositório de PDFs.** É uma camada de leitura do poder público local: o que está sendo contratado, por quem, a que preço, se há padrões relevantes e onde os dados ainda são incompletos.

### Princípios que não mudam

- Fonte oficial sempre visível — todo número tem origem rastreável.
- IA como apoio, não como fonte — resume, organiza, compara, mas não inventa.
- Lacunas explícitas — quando falta dado, a interface diz isso.
- Dados verificáveis — cada inferência diferencia fato extraído de estimativa.
- Mock nunca em produção.

### Município monitorado

| Campo | Valor |
|---|---|
| Município | Ritápolis/MG |
| IBGE | 3156106 |
| CNPJ Prefeitura | 18.557.553/0001-05 |
| CNPJ Câmara | 26.148.056/0001-81 |

---

## 2. Arquitetura de dados (três camadas)

```
1. Fatos locais      → parsers, tabelas de produtos, grupos por processo, anexos
2. Fonte nacional    → PNCP (vencedores, valores homologados, contratos — via API por CNPJ)
3. Síntese IA        → resumo por documento (v1.1), leitura integrada (v2.0), inteligência cruzada
```

A IA só opera sobre dado já estruturado nas camadas 1 e 2. Nunca substitui a coleta.

**PNCP — duas estratégias:**
- `pncp-orgaos.js` — usa a API de consulta pública (`/api/consulta/v1/contratacoes/publicacao`) com busca por CNPJ e modalidade. Preferencial quando o município publicar.
- `pncp.js` — busca fuzzy por data+modalidade+município. Fallback para documentos sem `numero_pncp`.

> **Status (junho 2026):** Ritápolis não publica no PNCP — todas as modalidades retornam 204. O campo `numero_pncp` está vazio em todos os 494 editais. A camada 2 da arquitetura está inativa até que o município integre ao portal nacional. Use `npm run pncp:sincronizar -- --check` para monitorar.

---

## 3. Estado atual da base (junho 2026)

| Dado | Valor |
|---|---|
| Documentos cadastrados | 545 |
| Da Prefeitura | 532 |
| Da Câmara | 13 |
| Licitações/editais | 494 |
| Resumos IA — editais 2026 | 25/25 (status ok) |
| Leitura integrada — 2026 | 26/26 licitações com grupo |
| Produtos estruturados | 219 em 8 licitações |
| Com preço final + fornecedor | 217 |
| Valores identificados | R$ 1,66M em 14 licitações com vencedor |
| Fornecedores consolidados (CNPJs únicos) | 25 |
| Licitações classificadas por categoria | 495 (7 categorias) |
| Resumos IA pendentes (anos anteriores) | ~380 (scheduler ativo) |

---

## 4. Histórico de versões

### v0.1–v0.3 — Fundação
Coleta real da Prefeitura e Câmara, banco SQLite, API Express, frontend básico. Suporte a PDF, DOCX, DOC. Deduplicação (65 registros removidos). Resumos IA com NVIDIA (chunking assíncrono, contrato v1.1). Grupos de processo (26 grupos 2026), leitura integrada contrato v2.0. Produtos estruturados: 219 itens, R$ 1,66M rastreados.

### v0.4–v0.5 — Design e validação
Design system glassmorphic. Novo tipo `publicacao_extrato`. Validação completa em desktop (1280px) e mobile (375px). `/sobre` com estado real.

### v0.6 — Camada de Inteligência
Auditoria de dados (score 0–100, 545 docs, distribuição por faixa). Consolidação de fornecedores (25 CNPJs únicos, ranking por valor). Classificação por categoria (495 licitações, 7 categorias). Dashboard público `/inteligencia` com panorama agregado, alertas e rankings.

### v0.7 — Schedulers + PNCP v3
Scheduler de coletas automáticas (12h, `collection-scheduler.js`). Scheduler de IA diário (2 ciclos × 15 docs, `ai-daily-scheduler.js`). Endpoint `GET /api/scheduler/status`. Integração PNCP v3 via API direta por CNPJ (`pncp-orgaos.js` + `pncp:sincronizar`). Documentação consolidada e repositório publicado no GitHub.

---

## 5. Roadmap v0.8+

### Prioridade alta

**Autenticação administrativa**
Proteger `/admin/*` com HTTP Basic Auth (usuário/senha em variável de ambiente). Sem banco de usuários, sem OAuth — proteção mínima antes de publicar amplamente.

**Cobertura PNCP anos anteriores**
Executar `npm run pncp:sincronizar` para todos os anos. Enriquecer `licitacoes_detalhes` com vencedores e valores do PNCP para 2023–2025.

**Build de produção e deploy**
Testar `next build && next start` em produção. Dockerizar backend + SQLite. Deploy em Railway/Fly.io (backend) + Vercel (frontend).

### Prioridade média

**Portal de transparência financeira**
Despesas, empenhos e pagamentos — cruzar com licitações quando a fonte estiver estável.

**Alertas públicos**
Notificar quando nova licitação de alto valor for publicada.

**Revisão de correspondências PNCP**
Interface em `/admin/pncp` para confirmar/rejeitar sugestões de correspondência com score intermediário.

### Decisões técnicas permanentes

- SQLite no curto e médio prazo
- Frontend consome apenas a API própria
- NVIDIA como provider padrão de IA; Gemini e Groq como fallback
- PNCP por CNPJ antes de busca fuzzy
- Classificação por keyword antes de chamar IA
- Mock nunca em produção
