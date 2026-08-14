# Monitor Ritápolis

Plataforma de inteligência pública verificável para o município de Ritápolis/MG. Coleta documentos oficiais da Prefeitura e da Câmara, estrutura dados com parsers determinísticos, enriquece com IA e apresenta ao cidadão de forma rastreável.

**Não é um repositório de PDFs.** É uma leitura do poder público local: o que está sendo contratado, por quem, a que preço, onde os dados estão incompletos e o que a IA consegue inferir com segurança.

## Requisitos

- Node.js 24 ou superior
- npm 11 ou superior

## Instalação

```bash
npm install
cd frontend && npm install && cd ..
```

## Configuração

Crie `.env` na raiz com base no `.env.example`:

```env
DB_PATH=./data/ritapolis.db
LOG_DIR=./logs
API_PORT=3001
NEXT_PUBLIC_API_URL=http://localhost:3001/api
IBGE_CODE=3156106
CNPJ_PREFEITURA=18557553000105
CNPJ_CAMARA=26148056000181
AI_SUMMARY_ENABLED=true
AI_PROVIDER=nvidia
NVIDIA_API_KEY=nvapi-sua-chave-aqui
```

## Primeiro uso

```bash
npm run setup-db
npm run coletar
```

## Subir localmente

```bash
npm start   # API na porta 3001 + Next.js dev na porta 3000
```

## Rotas públicas

| Rota | O que mostra |
|---|---|
| `/` | Home com gráficos reais e destaques |
| `/acervo` | Consulta principal de documentos |
| `/licitacoes` | Licitações e compras por ano e categoria |
| `/documento/:id` | Detalhe com fonte oficial, resumo IA e leitura integrada |
| `/analises` | Feed de análises verificáveis |
| `/temas` | Navegação por categoria |
| `/transparencia` | Indicadores públicos da base |
| `/inteligencia` | Dashboard cruzado — fornecedores, categorias, gastos |
| `/descobertas` | Descobertas (curiosidades/padrões nos dados) + detalhe `/descobertas/:id` |
| `/sobre` | Como a plataforma funciona e suas limitações |

## Área administrativa

| Rota | O que mostra |
|---|---|
| `/admin` | Visão geral operacional |
| `/admin/ia` | Cobertura, fila e jobs de resumos IA |
| `/admin/cobertura` | Cobertura das fontes monitoradas |
| `/admin/coletas` | Ações e status de coleta (inclui schedulers) |
| `/admin/alertas` | Descobertas: stats, gatilhos/config, gerar, arquivar/suprimir |
| `/admin/jobs` | Jobs & schedulers + ferramentas de manutenção e progresso |
| `/admin/qualidade` | Score de qualidade por documento |

`/admin` e subrotas usam HTTP Basic Auth quando `ADMIN_AUTH_USER` e
`ADMIN_AUTH_PASSWORD` estão definidos no ambiente. Sem essas variáveis, a
proteção fica desativada para desenvolvimento local.

Aliases: `/documentos` → `/acervo`, `/estatisticas` → `/transparencia`, `/ia` → `/admin/ia`, `/cobertura` → `/admin/cobertura`.

## Comandos principais

```bash
# Coleta
npm run coletar                          # Prefeitura + Câmara
npm run coletar:prefeitura
npm run coletar:camara

# IA — resumos por documento
npm run ai:resumir -- --documento-id=N
npm run ai:resumir-pendentes -- --ano=2026 --tipo=edital --limite=5
npm run ai:status -- --ano=2026

# IA — leitura integrada (correlação)
npm run ai:correlacionar -- --documento-id=N
npm run ai:revisar-integradas

# Licitações — estruturação
npm run licitacoes:agrupar -- --ano=2026
npm run licitacoes:estruturar
npm run licitacoes:detalhar
npm run licitacoes:enriquecer-produtos

# PNCP — Portal Nacional de Contratações Públicas
npm run pncp:sincronizar                 # Sincroniza vencedores/valores via API direta por CNPJ
npm run pncp:sincronizar -- --ano=2026 --dry-run
npm run pncp:diagnostico                 # Busca fuzzy por data+modalidade (fallback)

# Inteligência cruzada
npm run inteligencia:auditar             # score de qualidade por documento
npm run inteligencia:fornecedores        # consolida perfis de fornecedor
npm run inteligencia:categorizar         # classifica licitações por categoria

# Alertas de inteligência (insights recorrentes sobre os resumos IA)
npm run alertas:gerar                     # gera/atualiza alertas (narrativa IA)
npm run alertas:gerar:dry                 # prévia sem gravar

# Build
npm run build --prefix frontend
```

## Estado atual (gerado automaticamente)

Atualizado em: 2026-08-14. Gere novamente com `npm run docs:dados`.

- 578 documentos: 574 de site_prefeitura, 3 de camara, 1 de pncp
- 544 editais; 548/578 documentos com texto extraido (95%)
- 1493 resumos IA ok; 9 resumo(s) exigem revalidacao por falta de texto-fonte atual
- 495/544 editais com vencedor (91%)
- 291/544 editais com valor final (53%)
- 12999 produtos estruturados em 419 documento(s); 132 editais ainda sem produtos
- 14 edital(is) do mandato atual com produtos sem preço final por item: preco_item_nao_aplicavel=5, resultado_final_nao_publicado=4, fonte_sem_detalhamento_por_item=3, valor_global_sem_rateio=2
- 494 fornecedores consolidados; 7 categorias ativas
- 88 descobertas/alertas ativos; automação ligada; pendente=não
- 0 anexo(s) aguardando OCR; 37 edital(is) sem PDF (9 sem texto, 28 com texto oficial da pagina)
- Diretório `data/`: 3.2 GB, incluindo 15 backup(s) SQLite (1.8 GB)

## Limitações conhecidas

- PNCP: Ritápolis publica só pontualmente no Portal Nacional de Contratações
  Públicas (1 Pregão confirmado, 2025/1) — a base principal vem do portal
  próprio da Prefeitura. `pncp:sincronizar` roda automaticamente conforme o
  município publicar mais.
- Área administrativa protegida por Basic Auth quando `ADMIN_AUTH_USER` e `ADMIN_AUTH_PASSWORD` estão configurados
- Banco SQLite local, sem replicação com servidor externo
- Câmara usa certificado expirado — o coletor já trata automaticamente

## Problemas de ambiente

- `node:sqlite` emite `ExperimentalWarning` no Node 24 — esperado, não afeta o funcionamento
- Coleta da Prefeitura pode demorar por volume de PDFs
