# Como contribuir

Obrigado por querer ajudar. Antes de tudo, leia o [código de conduta](CODE_OF_CONDUCT.md). Falha de
segurança não vai em issue pública: veja [`SECURITY.md`](SECURITY.md).

## Jeitos de contribuir

- **Achou um dado errado ou sem fonte?** Abra uma issue com o modelo "Dado errado ou sem fonte".
- **Quer montar para a sua cidade?** Siga [`docs/ADICIONAR_MUNICIPIO.md`](docs/ADICIONAR_MUNICIPIO.md)
  e, se travar, abra uma issue "Montar para um novo município".
- **Código:** abra uma issue antes de um PR grande. Correção pontual pode ir direto em PR.

## Setup local

Requisitos: Node.js 24+ e npm 11+. Para só ver funcionando, `docker compose up --build` basta.

```bash
git clone https://github.com/henriqueogs/monitor_ritapolis.git
cd monitor_ritapolis
npm install
cd frontend && npm install && cd ..

cp .env.example .env     # MUNICIPIO escolhe a pasta em municipios/; chave de IA é opcional
npm run setup-db

npm run api              # API em http://localhost:3001
npm run dev:frontend     # site em http://localhost:3000
```

## Estrutura do projeto

```
municipios/             Um municipio.json por cidade (identidade e endereços das fontes)
src/
  api/server.js         Rotas HTTP (sem regra de negócio)
  coletores/            Leitura das fontes oficiais (site, portal, Câmara)
  coletas/              Agendamento e sincronização incremental
  parsers/, licitacoes/ Regras de domínio (extração, agrupamento, normalização)
  integracoes/          PNCP e fontes nacionais
  ai/                   Resumos, leitura integrada, busca (RAG)
  db/                   Repositórios SQLite (node:sqlite)
  config.js, ente.js, fontes.js   Configuração e identidade do município
scripts/                Comandos npm (coleta, IA, PNCP, manutenção)
frontend/               Next.js (App Router), CSS Modules
tests/                  Guardas, testes de integração e E2E
```

## Padrões

O [`CLAUDE.md`](CLAUDE.md) é o guia de padrões do projeto, para pessoas e para IA. O essencial:

- **Teste primeiro** (TDD): escreva o teste, veja falhar, implemente.
- **Camadas:** regra de negócio no domínio; rotas, coletores e repositórios não decidem nada.
- **Nada de município escrito à mão:** CNPJ, UF, IBGE e domínios vêm de `municipios/`. As guardas
  `tests/ente-sem-literal.test.js` e `tests/fontes-sem-host.test.js` falham se aparecer.
- **Dado ao cidadão:** soma sempre com período, "recente" é data de publicação, fonte sempre visível
  (§11 do `CLAUDE.md`).

Antes do PR:

```bash
npm test
npm run lint
cd frontend && npm run build
```

O modelo de PR traz o checklist.

## Princípios do projeto

- **Fonte oficial sempre visível**: todo número tem origem rastreável.
- **IA como apoio**: resume, organiza e compara; não inventa dados.
- **Lacunas explícitas**: quando falta dado, a interface diz isso.
- **Mock nunca em produção**: dados reais ou nada. Os fictícios do `_exemplo` se identificam como tal.
