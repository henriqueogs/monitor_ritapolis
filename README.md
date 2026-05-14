# Monitor Ritapolis

MVP para coleta, armazenamento e visualizacao de dados publicos da Prefeitura e da Camara de Ritapolis/MG.

Hoje o projeto ja possui:

- backend em Node.js;
- banco SQLite local;
- coletores da Prefeitura e da Camara;
- API REST minima;
- frontend em Next.js.

## Requisitos

- Node.js 24 ou superior
- npm 11 ou superior

## Estrutura

```text
.
|-- frontend/          # app Next.js
|-- scripts/           # comandos de execucao
|-- src/
|   |-- api/           # API Express
|   |-- coletores/     # coletores das fontes
|   |-- db/            # schema e acesso ao banco
|   `-- parsers/       # parsing de PDF e extracao de campos
|-- .env.example
`-- package.json
```

## Instalacao

Instale as dependencias do backend:

```bash
npm install
```

Instale as dependencias do frontend:

```bash
cd frontend
npm install
cd ..
```

## Configuracao

Crie um arquivo `.env` na raiz do projeto com base no `.env.example`.

Exemplo:

```env
DB_PATH=./data/ritapolis.db
LOG_DIR=./logs
API_PORT=3001
API_HOST=0.0.0.0
NEXT_PUBLIC_API_URL=http://localhost:3001/api
COLETOR_DELAY_MS=1000
COLETOR_TIMEOUT_MS=15000
COLETOR_RETRY_MAX=3
COLETOR_USER_AGENT=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36
IBGE_CODE=3156106
CNPJ_PREFEITURA=18557553000105
CNPJ_CAMARA=26148056000181
AI_SUMMARY_ENABLED=true
AI_PROVIDER=nvidia
NVIDIA_API_KEY=nvapi-sua-chave-aqui
```

## Primeiro uso

Inicialize o banco:

```bash
npm run setup-db
```

## Resumos de PDFs com IA

O backend suporta uma camada opcional de enriquecimento por IA para gerar resumos estruturados de PDFs sem alterar os campos oficiais da tabela `documentos`.

O provider operacional suportado atualmente e `nvidia`. O provider de testes `mock` foi removido para evitar mistura de resumos simulados com dados reais.

### Como obter a chave da NVIDIA

1. Acesse `https://build.nvidia.com`.
2. Faca login ou crie uma conta NVIDIA Developer.
3. Abra `https://build.nvidia.com/settings/api-keys`.
4. Crie uma nova API key.
5. Copie a chave.
6. Adicione no `.env`:

```env
AI_PROVIDER=nvidia
NVIDIA_API_KEY=nvapi-sua-chave-aqui
```

7. Teste a integracao:

```bash
npm run ai:test
```

8. Gere o resumo de um documento:

```bash
npm run ai:resumir -- --documento-id=1
```

Para acompanhar a cobertura dos resumos:

```bash
npm run ai:status
npm run ai:status -- --ano=2026 --tipo=edital
```

## Coleta de dados

Rodar os dois coletores:

```bash
npm run coletar
```

Rodar somente a Prefeitura:

```bash
npm run coletar:prefeitura
```

Rodar somente a Camara:

```bash
npm run coletar:camara
```

Observacoes:

- a coleta da Prefeitura pode demorar alguns minutos porque processa muitos PDFs;
- a Camara usa um portal com certificado expirado, e o coletor ja trata isso;
- alguns PDFs podem falhar no parse e ser salvos com `status_coleta = erro_pdf`.

## Subir a API

```bash
npm run api
```

API disponivel em:

```text
http://localhost:3001/api
```

Endpoints principais:

- `GET /api/health`
- `GET /api/documentos`
- `GET /api/documentos/:id`
- `GET /api/coletas/log`

Exemplos:

```text
http://localhost:3001/api/documentos?limite=10
http://localhost:3001/api/documentos?fonte=site_prefeitura&tipo=edital
http://localhost:3001/api/coletas/log?limite=5
```

## Subir o frontend

Em outro terminal:

```bash
npm run dev
```

Frontend disponivel em:

```text
http://localhost:3000
```

## Subir tudo junto

Para subir API e frontend ao mesmo tempo:

```bash
npm start
```

## Build do frontend

Para validar o build de producao:

```bash
cd frontend
npm run build
cd ..
```

## Onde ficam os dados

- Banco SQLite: caminho definido em `DB_PATH`
- Logs da aplicacao: pasta definida em `LOG_DIR`

Por padrao:

- banco: `./data/ritapolis.db`
- logs: `./logs/app.log`

## Fluxo recomendado de desenvolvimento

1. Instalar dependencias do backend e do frontend.
2. Criar `.env`.
3. Rodar `npm run setup-db`.
4. Rodar `npm run coletar:camara` para uma validacao mais rapida.
5. Rodar `npm run coletar:prefeitura` para popular a base principal.
6. Subir a API com `npm run api`.
7. Subir o frontend com `npm run dev`.

## Estado atual do MVP

No estado validado localmente:

- coletor da Prefeitura funcionando via endpoints reais de cadastro generico;
- coletor da Camara funcionando via portal SH3;
- API retornando dados reais do banco;
- frontend renderizando listagem e detalhe de documentos.

## Problemas conhecidos

- `node:sqlite` em Node 24 ainda emite `ExperimentalWarning`;
- a coleta da Prefeitura pode exceder timeouts curtos de terminal;
- alguns PDFs antigos geram ruido interno no parser, mas o projeto continua salvando os dados quando possivel.
