# Como contribuir

## Setup local

```bash
# 1. Clone o repositório
git clone https://github.com/henriqueogs/monitor_ritapolis.git
cd monitor_ritapolis

# 2. Instale as dependências
npm install
cd frontend && npm install && cd ..

# 3. Configure o ambiente
cp .env.example .env
# Edite .env e adicione sua NVIDIA_API_KEY (ou GEMINI_API_KEY como alternativa)

# 4. Inicialize o banco de dados
npm run setup-db

# 5. Suba o servidor
npm start
# API em http://localhost:3001
# Frontend em http://localhost:3000
```

## Estrutura do projeto

```
src/
  api/server.js         Express + todas as rotas
  db/index.js           CRUD SQLite (DatabaseSync, node:sqlite)
  ai/                   Resumos IA, leitura integrada, schedulers
  integracoes/          PNCP — consulta por CNPJ e busca fuzzy
  coletas/              Schedulers e coordenação de coleta
  coletores/            Parsers da Prefeitura e Câmara
  parsers/              Extração de produtos e detalhes
  config.js             Configuração central (carrega .env)
scripts/                Scripts npm (coleta, IA, PNCP, inteligência)
frontend/               Next.js 14, React 18, CSS modules
data/                   Banco SQLite (não versionado)
```

## Princípios do projeto

- **Fonte oficial sempre visível** — todo número tem origem rastreável
- **IA como apoio** — resume, organiza, compara; não inventa dados
- **Lacunas explícitas** — quando falta dado, a interface diz isso
- **Mock nunca em produção** — dados reais ou nada

## Issues e PRs

Abra uma issue antes de começar um PR grande. Para correções pontuais, PR direto é bem-vindo.
