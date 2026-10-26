# Adicionar um município

Guia para montar o Monitor na sua cidade a partir deste repositório (ADR 0007,
[`docs/adr/0007-repositorio-modelo.md`](adr/0007-repositorio-modelo.md)). Uma instalação serve um
município: banco, domínio e chaves próprios.

## 0. Ver funcionando antes

```bash
docker compose up --build
```

Sobe a "Cidade Exemplo" com 9 documentos fictícios, sem coleta e sem IA. Site em
http://localhost:3000, API em http://localhost:3001/api.

## 1. Fork e pasta do município

1. Faça um **fork** do repositório (não use o botão "Template": o fork recebe as correções do núcleo
   com `git pull`).
2. Copie o modelo: `cp -r municipios/_exemplo municipios/<slug>`. O slug é o nome da cidade em
   minúsculas, sem acento, com hífen: `sao-joao-del-rei`.

## 2. Preencher `municipios/<slug>/municipio.json`

| Campo                                | O que é                                                         | Onde achar                                        |
| ------------------------------------ | --------------------------------------------------------------- | ------------------------------------------------- |
| `slug`                               | Igual ao nome da pasta                                          | Você escolheu no passo 1                          |
| `nome`, `uf`, `ufNome`               | Nome oficial com acento, sigla e nome da UF                     | IBGE                                              |
| `ibge`                               | Código do município, 7 dígitos                                  | [IBGE Cidades](https://cidades.ibge.gov.br)       |
| `cnpjPrefeitura`, `cnpjCamara`       | CNPJs, só dígitos                                               | Rodapé do site oficial ou consulta no PNCP        |
| `marca`                              | Nome do site exibido ao cidadão                                 | Sua escolha (ex.: `SuaCidade.org`)                |
| `dominioSite`                        | Domínio do seu site, sem `https://`                             | O domínio que você registrar                      |
| `dominioPrefeitura`, `dominioCamara` | Domínios oficiais, sem `https://`                               | Ex.: `suacidade.mg.gov.br`, `suacidade.mg.leg.br` |
| `portalTransparencia`                | Origem do Portal da Transparência, com `https://` e sem caminho | Link "Transparência" do site da Prefeitura        |

O editor valida o arquivo pelo `municipios/municipio.schema.json`. Depois:

```bash
npm run municipio:frontend   # copia os municípios para frontend/lib/municipios.json
npm test                     # confere a pasta nova contra o schema e as guardas
```

## 3. Variáveis de ambiente

No `.env` da API (a partir do `.env.example`):

- `MUNICIPIO=<slug>`
- `ADMIN_BOOTSTRAP_TOKEN`: um valor longo e aleatório, só seu.
- `FRONTEND_URL`, `PUBLIC_SITE_URL`, `ALLOWED_ORIGINS`: o endereço do seu site.
- IA (opcional no começo): `AI_PROVIDER` e a chave do provedor (`NVIDIA_API_KEY`, `GEMINI_API_KEY`
  ou `GROQ_API_KEY`). Sem chave, deixe `AI_SUMMARY_ENABLED=false` e `AI_SCHEDULER_ENABLED=false`.

No build do site: `NEXT_PUBLIC_MUNICIPIO=<slug>` e `NEXT_PUBLIC_API_URL` apontando para a sua API.

Nunca versione o `.env`. Veja [`SECURITY.md`](../SECURITY.md).

## 4. As fontes da sua cidade

Os coletores leem sistemas de **fornecedores**, não "da cidade". O que já existe:

| Fonte                     | Sistema que o coletor conhece                                       | Se a sua cidade usa outro                                              |
| ------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Portal da Transparência   | SH3 Informática (`/Tempo_Real_Despesa`, `Detalhamento_Despesa.php`) | Precisa de coletor novo                                                |
| Site da Prefeitura        | CMS com páginas `ws_consulta/Pagina.php?INT_PAG=`                   | IDs de página são locais; ajuste em `src/coletores/site-prefeitura.js` |
| Câmara                    | SGC (`/ws_consulta/sgc/...`)                                        | Precisa de coletor novo                                                |
| PNCP, Receita (CNPJ), TSE | Nacionais                                                           | Usam o CNPJ e a UF do `municipio.json`, sem coletor local              |

Para saber se o seu portal é SH3, abra `<portalTransparencia>/Tempo_Real_Despesa`: se a página de
despesas em tempo real aparecer, o coletor deve funcionar sem mudança.

As fontes nacionais funcionam em qualquer município:

```bash
npm run setup-db
npm run pncp:sincronizar:prefeitura
npm run pncp:sincronizar:camara
```

Um contrato comum para coletores (`Coletor`) e um modo só com fontes nacionais estão no roteiro
(item 5 do [plano](PLANO_IA_RAG.md)). Se a sua fonte não é coberta, abra uma issue com o modelo
**Montar para um novo município**.

## 5. Primeira coleta e subida

```bash
npm run setup-db
npm run coletar        # coleta incremental das fontes configuradas
npm run api            # API em :3001
npm run dev:frontend   # site em :3000
```

Confira na tela que todo documento tem link para a fonte oficial (regra §11.3 do `CLAUDE.md`).
Em produção, a instância de Ritápolis usa uma VM para a API e a Vercel para o site; o passo a passo
está em [`docs/DEPLOY.md`](DEPLOY.md).

## O que ainda cita Ritápolis

Alguns textos de página do frontend (destaque da home, contexto da cidade com população e
gentílico) e scripts históricos de correção de dados. O inventário está em
[`docs/MAPA_GENERICO_VS_RITAPOLIS.md`](MAPA_GENERICO_VS_RITAPOLIS.md).
