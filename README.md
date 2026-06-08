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
| `/sobre` | Como a plataforma funciona e suas limitações |

## Área administrativa

| Rota | O que mostra |
|---|---|
| `/admin` | Visão geral operacional |
| `/admin/ia` | Cobertura, fila e jobs de resumos IA |
| `/admin/cobertura` | Cobertura das fontes monitoradas |
| `/admin/coletas` | Ações e status de coleta (inclui schedulers) |
| `/admin/qualidade` | Score de qualidade por documento |

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

# Build
npm run build --prefix frontend
```

## Estado atual (v0.7 — junho 2026)

- 545 documentos: 532 da Prefeitura, 13 da Câmara
- 25/25 editais de 2026 com resumo IA (status ok)
- 26/26 licitações 2026 com leitura integrada
- 219 produtos estruturados, 217 com preço final e fornecedor
- R$ 1,66M identificados em 14 licitações com vencedor
- 495 licitações classificadas em 7 categorias (Equipamentos, Serviços, Saúde, Obras, Educação, Alimentação, Outros)
- 25 CNPJs de fornecedores consolidados
- Schedulers automáticos ativos: coleta (12h) e resumos IA (2 ciclos/dia × 15 docs)
- Todas as rotas validadas em desktop (1280px) e mobile (375px)

## Limitações conhecidas

- Resumos IA anos anteriores: 407 pendentes — scheduler processa gradualmente (30/dia)
- PNCP API pública: timeouts e 503 intermitentes são da fonte, não do código
- Sem autenticação administrativa: `/admin` é público nesta fase
- Banco SQLite local, sem replicação com servidor externo
- Câmara usa certificado expirado — o coletor já trata automaticamente

## Problemas de ambiente

- `node:sqlite` emite `ExperimentalWarning` no Node 24 — esperado, não afeta o funcionamento
- Coleta da Prefeitura pode demorar por volume de PDFs
