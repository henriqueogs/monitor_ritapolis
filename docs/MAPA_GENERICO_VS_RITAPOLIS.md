# Mapa "genérico vs. Ritápolis"

Insumo da **Fase 3** (núcleo agnóstico a cidades) do [`PLANO_IA_RAG.md`](PLANO_IA_RAG.md). Responde:
*o que no código é regra do Brasil/de município em geral, e o que só vale para Ritápolis?*

Levantado em 20/10/2026 sobre o `master` (`444632d`), por busca textual (`grep`) em `src/`, `scripts/`,
`frontend/`, `deploy/`, `infrastructure/`, `.github/` e arquivos de raiz. É um **inventário estático**:
acha literais (nomes, CNPJs, hosts, códigos); não acha acoplamento implícito (um parser que só funciona
com o HTML de um CMS, por exemplo). Esses casos entram na seção 3 por leitura, não por busca. Testes e
fixtures foram deixados de fora das contagens.

> Só documentação: nenhuma linha de código foi alterada para produzir este mapa.

## 1. Resumo

| Camada | Estado | Esforço p/ outra cidade | Observação |
|---|---|---|---|
| **Domínio** (valores EO/EE-EG/OP, mandato, período, categorias contábeis, finalidade, tipo de empenho) | Genérico | Baixo | Regras do orçamento público brasileiro e da eleição municipal (ciclo de 4 anos). Exceções pontuais na seção 2.4 |
| **Infraestrutura de IA** (portas, vetor, híbrido, indexador, verificador, `perguntar()`) | Genérico | Baixo | Só os 3 prompts nomeiam a cidade (seção 2.5) |
| **Identidade do ente** (CNPJ, IBGE, UF) | Específico, **duplicado** | Baixo, mas hoje espalhado | Existe em `config.js`, mas o código repete os literais (7 CNPJs em 5 arquivos, mais a UF em 3 pontos; seção 2.1) |
| **Coletores** (site, portal, Câmara) | **Específico** | **Alto** | Cada fonte é um sistema/CMS de um fornecedor com endereços e IDs de página locais (seção 2.2) |
| **Frontend** (marca, textos, links de fonte) | Misto | Médio | Marca e textos são strings soltas em mais de 15 arquivos; `source-links.js` reconhece hosts locais (seção 2.6) |
| **Infra/ops** (deploy, VM, Worker, workflows) | Específico | Médio | Nomes de serviço, domínios e buckets do projeto (seção 2.7) |
| **Dados/one-offs** (scripts de correção) | Específico | Não migrar | Scripts históricos com CNPJs e correções de Ritápolis (seção 2.8) |

**Leitura geral:** o miolo de regras já é quase todo reutilizável. O custo real de outra cidade está nos
**coletores** (como obter os dados) e em **centralizar a identidade** (quem é o ente). A IA entra pronta.

## 2. Inventário por categoria

### 2.1 Identidade do ente (CNPJ, IBGE, UF)

Valores de Ritápolis: CNPJ da Prefeitura `18557553000105`, CNPJ da Câmara `26148056000181`, IBGE `3156106`, UF `MG`.

`src/config.js` já os expõe (`cnpjPrefeitura`, `cnpjCamara`, `ibgeCode`, via `CNPJ_PREFEITURA`,
`CNPJ_CAMARA`, `IBGE_CODE`; também no `.env.example`). **O código, porém, não os usa de forma consistente:**

| Onde | Literal | Deveria ler de |
|---|---|---|
| `src/coletores/pncp.js` (`ORGAOS`, com nomes "Prefeitura/Câmara Municipal de Ritápolis") | CNPJs + nomes | config do ente |
| `src/db/inteligencia-repo.js` (`CNPJS_EXCLUIR_CONCENTRACAO`) | CNPJs | config do ente |
| `src/parsers/licitacao-detalhes.js` (`PREFEITURA_CNPJ`, formato `18.557.553/0001-05`; também testa "município de Ritápolis" no texto) | CNPJ + nome | config do ente |
| `src/parsers/licitacao-resultados-itens.js` (`CNPJ_PREFEITURA`) | CNPJ | config do ente |
| `frontend/app/transparencia/components/TopCredores.js` (`CNPJ_PREFEITURA`) | CNPJ | config do ente (exposto ao frontend) |
| `src/integracoes/pncp.js` (2×) e `scripts/pncp-diagnostico.js` | `uf = 'MG'` | config do ente |
| `frontend/app/_home/components/CityContext.js` | IBGE `3156106`, população 4.994 (Censo 2022), gentílico, link do IBGE | dados do ente |

> **Atualização (20/10/2026):** os literais desta tabela foram trocados por `src/ente.js` (PR #171, passo 1 da Fase 3), com a guarda `tests/ente-sem-literal.test.js`. A guarda achou um literal que este levantamento não tinha: o **regex do cabeçalho impresso dos PDFs** (endereço, CEP, telefone e CNPJ), duplicado com variantes em `src/parsers/licitacao-produtos.js` e `src/parsers/licitacao-resultados-itens.js`. Os dois ficam como exceções justificadas na guarda; consolidá-los é trabalho do passo 4 (contrato `Coletor`).

**Risco (antes do passo 1):** trocar `CNPJ_PREFEITURA` no `.env` muda o coletor genérico mas **não** a exclusão de
concentração, o parser de licitação nem a tela de credores. Em outra cidade, essas partes ficariam
silenciosamente erradas (sem erro, só número errado).

### 2.2 Fontes de dados (hosts, sistemas, IDs de página)

| Fonte | Natureza | Onde está o acoplamento | Reuso |
|---|---|---|---|
| **Site da Prefeitura** (`ritapolis.mg.gov.br`) | CMS de fornecedor; páginas por ID (`INT_PAG=6668`, `9656`, … ~9 ocorrências) e arquivos por `INT_ARQ`; endpoint `ws_consulta` | `src/coletores/site-prefeitura.js` (`BASE_URL` fixo, 514 linhas), `site-prefeitura-legislacao.js`, `src/transparencia/portal-links.js`, `src/api/server.js` (`SOURCE_PREVIEW_HOSTS`) | **Só se a outra cidade usar o mesmo CMS.** Os IDs de página são locais; o formato do HTML é do fornecedor |
| **Portal da Transparência** (`pt.ritapolis.mg.gov.br`, sistema "SH3") | Portal de fornecedor; fluxo sessão+token+thread+CSV; deep-link `Detalhamento_Despesa.php?ID8_DESP` | `portal-transparencia*.js`, `folha*.js`, `sh3.js`, `src/transparencia/portal-links.js`, `src/db/transparencia-repo.js`, `config.js` (exercício inicial) | **Reutilizável entre prefeituras que usam o mesmo produto**, com host por configuração |
| **Câmara** (`sgc.ritapolis.mg.leg.br`, `ritapolis.mg.leg.br`) | Sistema de gestão legislativa de fornecedor | `camara-sgc.js`, `camara-legislacao.js`, `camara-projetos.js` (encoding latin1 em 2 endpoints) | Mesma ressalva: depende do fornecedor |
| **PNCP** (`pncp.gov.br`) | **Nacional** | `pncp.js`, `pncp-identity.js`, `pncp-orgaos.js` (+ `config.js`) | **Genérico**: só precisa de CNPJ e UF/IBGE por parâmetro |
| **BrasilAPI / Receita** (CNPJ) | Nacional | `receita-cnpj.js`, `config.js` | Genérico |
| **TSE** (dados abertos, doadores/candidatos) | Nacional | `src/db/credores-repo.js` | Genérico |
| **IBGE** | Nacional | só no texto de `CityContext.js` | Genérico (dado do ente) |

Pontos de atenção:
- `src/coletores/site-prefeitura.js` e `site-prefeitura-legislacao.js` repetem `BASE_URL = 'https://ritapolis.mg.gov.br'`.
- O valor de `fonte` gravado no banco é `site_prefeitura` / `camara`, usado em `documentos`, filtros, planner e
  cobertura (`src/coletas/prefeitura-sync.js`, `src/cobertura/prefeitura.js`, `src/pipeline/planner.js`,
  `src/db/{index,documentos-repo,ai-jobs-repo}.js`, `src/api/server.js`). O **nome** descreve o tipo de fonte
  (site do executivo), não a cidade, então é aproveitável; mas o vocabulário "prefeitura/câmara" assume um
  município com esses dois poderes e dois sites.
- A coleta usa nomes e prefixos de arquivo do CMS (`INT_ARQ`) como **origem rastreável** (§11.3). Em outra
  cidade a regra "URL do arquivo = origem" continua valendo, mas o jeito de montá-la muda por fornecedor.

### 2.3 Hosts e URLs no código (contagem de literais)

> **Atualização (23/10/2026):** em `src/`, `scripts/`, `frontend/app`, `frontend/lib` e `frontend/next.config.js`
> os domínios abaixo passaram a vir de `municipios/<slug>/municipio.json` (`src/fontes.js` no backend,
> `frontend/lib/ente.js` no frontend), com a guarda `tests/fontes-sem-host.test.js`. Continuam fixos: workflows
> em `.github/`, `deploy/`, `infrastructure/` (Worker) e a URL do Worker `*.workers.dev`, que é da instalação.

Ocorrências **aproximadas** de URL (a contagem inclui comentários e docs; fixtures fora) em `src/ scripts/ frontend/ deploy/ infrastructure/ .github/`:

| Host | ~Ocorrências | Arquivos principais |
|---|---:|---|
| `ritapolis.mg.gov.br` | 20 | coletores do site, `portal-links.js`, `server.js`, `source-links.js`, `emendas/page.js`, `OrigemBadge.js` |
| `pt.ritapolis.mg.gov.br` | 14 | `portal-transparencia*.js`, `transparencia-repo.js`, `portal-links.js`, `EmpenhoSection.js`, `OrigemBadge.js`, `StatusColeta.js`, `transparencia/index.js` |
| `ritapolis.com` / `www.` | 14 | `frontend/app/lib/brand.js`, `next.config.js`, `server.js` (frame-ancestors, User-Agent), `check-portal-links.js`, workflow `pipeline-health.yml` |
| `api.ritapolis.com` | 10 | `scripts/check-portal-links.js`, `pipeline-health.yml` |
| `sgc.ritapolis.mg.leg.br` / `ritapolis.mg.leg.br` | 14 | coletores da Câmara, `source-links.js`, heartbeat |
| `*.workers.dev` (Worker de preview/heartbeat) | 3 | `DocumentPreviewPane.js`, `frontend/lib/csp.js`, `infrastructure/production-heartbeat` |
| `monitor-ritapolis-api.onrender.com` | 1 | `scripts/relatorio-limpeza-vinculos.js` (resquício do Render, hoje suspenso) |
| `pncp.gov.br` | 19 | genérico (nacional) |

### 2.4 Domínio: regras que parecem genéricas e têm um pé em Ritápolis

| Item | Onde | Classificação |
|---|---|---|
| Ciclo de mandato (4 anos, referência 2025) | `src/utils/mandato.js` | **Genérico** (todo município brasileiro: eleição em 2024, mandato 2025–2028). Fonte única |
| Valores EO / EE-EG / OP, "pago" nunca rotulado | `tipo-empenho.js`, `valor-final-empenho.js`, repos | **Genérico** quanto à regra; **depende da fonte** informar o tipo de empenho como o SH3 informa |
| Categoria econômica (código contábil `3.3.90.14…`) | `src/transparencia/categorias.js` | **Genérico** (classificação nacional da despesa) |
| Finalidade por regra determinística | `src/transparencia/finalidade.js` (`finalidade-v3`) | **Misto**: a estrutura é genérica; as palavras-chave de histórico foram calibradas nos textos de Ritápolis (balde "outros" < 1% medido só aqui) |
| Secretarias da folha (aliases "DEPARTAMENTO MUNICIPAL DE X" → "SECRETARIA DE X") | `src/transparencia/secretarias-folha.js` | **Específico**: reflete a reorganização administrativa de out/2025 de Ritápolis |
| Exclusão de entes públicos da concentração de fornecedores | `inteligencia-repo.js` (`CNPJS_EXCLUIR_CONCENTRACAO`, `NOMES_EXCLUIR_CONCENTRACAO`) | **Misto**: nomes (INSS, PASEP, IRRF, folha) são nacionais; os CNPJs são do ente (seção 2.1) |
| Faixa de plausibilidade de valor final de licitação (piso R$ 100, teto R$ 100 milhões) | `src/licitacoes/valores.js` | **Específico do porte**: comentário diz "município de pequeno porte (Ritápolis)". Outra cidade (maior) precisaria de outro teto |
| Limiares de dispensa por exercício | `src/inteligencia/periodo-inteligencia.js` (`REGIMES_LIMIAR_DISPENSA`) | **Genérico** (decretos federais); pendente o decreto 2025/2026 |
| Janela e exercício inicial do portal | `config.js` (exercício inicial do SH3, da folha) | **Específico** da disponibilidade de dados do portal local |
| Palavra "ritapolis" na lista de stopwords de candidatos a descoberta | `src/alertas/discovery-candidates.js` | **Específico** (trivial de parametrizar) |
| Parser de detalhes de licitação reconhece o município pelo nome no texto | `src/parsers/licitacao-detalhes.js` | **Específico** (heurística de "quem é o órgão") |

### 2.5 Camada de IA

A infraestrutura (portas, vetor, híbrido, indexador, verificador) **não** conhece a cidade. Pontos específicos:

| Onde | O quê | Ajuste futuro |
|---|---|---|
| `src/ai/prompts/rag-resposta.js` | Frase "documentos públicos da Prefeitura de Ritápolis (MG)" | Receber nome/UF do ente por parâmetro e versionar o prompt (`VERSAO_PROMPT`) |
| `src/ai/anomaly-narrative.js` | "analista de controle interno da Prefeitura de Ritápolis (MG)" e a frase de "nenhuma anomalia" | Idem |
| `tests/evals/` (corpus, dataset ouro) | Perguntas e documentos sintéticos escritos para Ritápolis; baseline do modelo real | Um dataset por ente; o harness já é genérico |
| `src/ai/rag/fontes-indexacao.js` | Prefixos `documento:`/`anexo:` e filtros `ano/tipo/fonte` | Genérico |
| `src/ai/rag/privacidade.js` | Máscara de CPF/e-mail/telefone brasileiros | Genérico para o Brasil |

### 2.6 Frontend

| Item | Onde | Observação |
|---|---|---|
| Marca (nome, tagline, URL do site) | `frontend/app/lib/brand.js` (`BRAND`, `BRAND_TAGLINE`, `SITE_URL`) | **Já é fonte única**; boa base para configuração por ente |
| Logo e ícones | `app/ritapolis-logo.png`, `icon.png`, `opengraph-image.js`, `BrandMark.js`, `TopNav.js` | Trocar por ente |
| Textos que citam a cidade | mais de 15 arquivos: `analises`, `anexo/[id]`, `busca`, `credores`, `documento/[id]`, `emendas`, `inteligencia`, `admin/layout`, etc. (títulos, descrições de SEO) | Strings soltas; devem passar por `brand.js`/config |
| Contexto da cidade | `_home/components/CityContext.js` | Dados do ente (IBGE, população, gentílico) |
| Reconhecimento de origem | `app/lib/source-links.js` (10 ocorrências: hosts do site, do portal, da Câmara; páginas "genéricas" de listagem; módulos da Câmara) | **Específico por fonte**; precisa vir de configuração do coletor (quais hosts/URLs são "listagem genérica") |
| Links fixos de portal | `OrigemBadge.js`, `EmpenhoSection.js` (`PORTAL_BASE`), `StatusColeta.js`, `transparencia/index.js`, `emendas/page.js` (IDs `pagina/21642`, `pagina/21947`) | Específico |
| CSP e domínios | `frontend/lib/csp.js`, `next.config.js` | Host do Worker de preview e domínio do site; por ambiente |
| Chaves de armazenamento local | `AuthControl.js` (`monitor-ritapolis-admin-mode`) | Cosmético |

### 2.7 Infra e operação

| Item | Onde | Observação |
|---|---|---|
| Serviço e overrides do systemd | `deploy/systemd/monitor-ritapolis.service.d/` | Nome do serviço do projeto |
| Guard de uso do R2 | `deploy/r2-guard-receiver.sh`, `litestream.yml`, `src/storage/r2-database-backup.js` | Buckets/prefixos do projeto |
| Heartbeat e preview de PDF | `infrastructure/production-heartbeat/` (Worker da Cloudflare, `wrangler.jsonc`, `src/index.js`) | Lista de URLs monitoradas e hosts permitidos são de Ritápolis |
| Workflows | `.github/workflows/pipeline-health.yml` (URLs `ritapolis.com`, `api.ritapolis.com`) | Por ambiente |
| Cabeçalhos/identificação HTTP | `src/api/server.js` (`User-Agent: Ritapolis-com/1.0`, CSP `frame-ancestors`, `SOURCE_PREVIEW_HOSTS`), `src/api/security.js` (realm) | Por ambiente |
| Nome do projeto em logs/docs | `scripts/*` (cabeçalhos "Monitor Ritápolis"), `package.json` | Cosmético |

### 2.8 Scripts com dados ou nome de Ritápolis embutidos (não migrar)

Scripts históricos ou operacionais do projeto; ficam fora do núcleo e não devem ser portados como estão:
`scripts/resolver-lacunas-produtos-mapeadas.js` (CNPJs de fornecedores específicos),
`scripts/consolidar-produtos-recoletados.js`, `scripts/enriquecer-produtos-licitacoes.js`,
`scripts/relatorio-limpeza-vinculos.js`, `scripts/testar-sh3-anos-anteriores.js`,
`scripts/pncp-sincronizar.js` (exemplo com o CNPJ no comentário de uso), `scripts/importar-pncp-compra.js`,
`scripts/organizar-backups.js`, `scripts/check-vm-capacity.js`, `scripts/migrate-sqlite-to-postgres.js`.

## 3. Acoplamentos implícitos (por leitura, não por busca)

1. **Os coletores são o produto de um fornecedor, não "da cidade".** O que muda de cidade para cidade é o
   fornecedor. Duas prefeituras com o mesmo CMS/portal reaproveitam o coletor trocando host e IDs; cidades
   com outro fornecedor exigem um coletor novo atrás do mesmo contrato.
2. **O esquema assume "Prefeitura + Câmara".** `fonte`, cobertura (`src/cobertura/prefeitura.js`), sync
   (`prefeitura-sync.js`) e o planner usam esses dois rótulos. Um ente consorciado, autarquia ou município
   sem site legislativo próprio não cabe sem generalizar o vocabulário.
3. **Qualidade de dados calibrada em uma amostra.** Finalidade (< 1% "outros"), faixa de valores,
   secretarias e a lista de anomalias foram medidos nos dados de Ritápolis. Em outra cidade, o primeiro passo
   é **medir de novo**, não presumir.
4. **Origem rastreável (§11.3) depende da fonte.** Hoje ela existe porque o CMS expõe URL de arquivo. Um
   coletor novo deve provar que consegue `url_origem` por documento (ou assumir a listagem como origem
   genérica) antes de entrar.
5. **Banco único, sem coluna de ente.** Não há `ente_id`/`municipio_id` nas tabelas; multi-cidade no mesmo
   banco é a Fase 4 (multi-tenant) e não cabe como remendo.

## 4. Ordem sugerida para a Fase 3

1. **Ente como configuração** (baixo risco, alto retorno): um módulo/objeto `ente` (nome, UF, IBGE, CNPJs,
   domínios, marca) lido de `config.js`; trocar os literais da seção 2.1 por ele; um teste que falha se
   aparecer CNPJ literal fora da configuração.
2. **Parametrizar os 3 prompts** da seção 2.5 com nome/UF do ente e subir `VERSAO_PROMPT`; rodar `npm run eval:ia`
   antes e depois.
3. **Marca e textos do frontend** via `brand.js` (que já é fonte única) e um objeto de ente exposto ao frontend.
4. **Contrato `Coletor`** + modelo canônico (Documento, Licitação, Empenho, Credor): o coletor atual vira o
   primeiro adaptador (`site-prefeitura`, `portal-transparencia`, `camara-sgc`), PNCP vira o segundo tipo
   (nacional, só CNPJ+UF).
5. **Parâmetros dependentes de porte** (faixa de valores, limiares) por ente, com valor padrão e medição.
6. Só então pensar em segundo município (e na Fase 4).

**Andamento (20/10/2026):** passo 1 feito (#171); passo 2 feito (#172, prompts com o ente e `rag-resposta-v2`); passo 3 feito só nos pontos centrais do frontend (#175: metadados, layout, marca, disclaimer e links de fonte). Pendentes: textos de página do frontend (~30 arquivos), `CityContext`, `emendas`, contrato `Coletor` (passo 4) e parâmetros por porte (passo 5).

## 5. Regras para código novo (enquanto a Fase 3 não chega)

- Não criar literal de CNPJ, código IBGE, UF, host de fonte ou nome da cidade fora de `src/config.js`
  (backend) e `frontend/app/lib/brand.js` (frontend). Se for preciso, ler de lá.
- Texto para o cidadão que cite a cidade deve usar `BRAND`/config, não a string solta.
- Coletor novo: declarar de onde sai o `url_origem` de cada documento e o rótulo de origem genérica.
- Parâmetro calibrado em dados de Ritápolis leva comentário com a medição que o justifica.

## 6. Como regenerar este inventário

```bash
# menções ao nome da cidade (ignora testes e fixtures; use alternância, não colchete, por causa do "á")
grep -rIiE "rit(a|á)polis" src scripts frontend/app frontend/lib deploy infrastructure .github \
  --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.next-dev --exclude-dir=__fixtures__ \
  --include=*.js --include=*.json --include=*.yml --include=*.service --include=*.sh --include=*.toml

# CNPJs literais
grep -rInE "[0-9]{2}\.?[0-9]{3}\.?[0-9]{3}/?[0-9]{4}-?[0-9]{2}" src scripts frontend/app frontend/lib \
  --include=*.js --include=*.json --include=*.sql

# hosts de fontes
grep -rIhoE "https?://[a-zA-Z0-9.-]+\.(gov\.br|leg\.br|com)[^'\"\` )]*" src scripts frontend/app frontend/lib \
  | sed -E 's#(https?://[^/]+).*#\1#' | sort | uniq -c | sort -rn
```

Os números mudam a cada commit; o que importa é a **forma** do mapa (quais camadas têm literal e por quê).
