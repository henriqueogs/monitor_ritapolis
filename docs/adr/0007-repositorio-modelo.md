# ADR 0007 — Este repositório vira o modelo; município em `municipios/<slug>/`

**Status:** aceito (22/10/2026)

## Contexto
O objetivo é que qualquer pessoa monte o monitor do seu município a partir deste código, com a
camada de IA completa (ver o documento "Repositório-modelo: arquitetura e roteiro" e o
[`MAPA_GENERICO_VS_RITAPOLIS.md`](../MAPA_GENERICO_VS_RITAPOLIS.md)). Foram avaliadas três formas:
repositório novo extraído deste, transformar este repositório, ou um monorepo multi-cidade.
Henrique escolheu **transformar este repositório**.

## Decisão
- Este repositório é o modelo. Ritápolis é a instância de referência e continua em produção daqui.
- Cada município é uma pasta `municipios/<slug>/` com `municipio.json` (schema em
  `municipios/municipio.schema.json`). A variável `MUNICIPIO` escolhe a pasta; o padrão é `ritapolis`.
- Distribuição por **fork**, não pelo botão "Template" do GitHub: o fork recebe correções do núcleo
  com `git pull`; a cópia por template perde o vínculo.
- Uma instalação por município (banco, domínio e chaves próprios). Multi-tenant continua na Fase 4.
- Variáveis individuais (`MUNICIPIO_NOME`, `UF_MUNICIPIO`, `IBGE_CODE`, `CNPJ_PREFEITURA`,
  `CNPJ_CAMARA`) continuam vencendo o arquivo, para não quebrar instalações existentes.

## Consequências
+ Trocar de município passa a ser trocar uma pasta e uma variável, não editar código.
+ A guarda `tests/ente-sem-literal.test.js` deixa de aceitar literal em `src/config.js`.
+ O frontend lê `frontend/lib/municipios.json`, cópia gerada por `npm run municipio:frontend` (a Vercel
  usa `frontend/` como raiz e não enxerga `municipios/`); `NEXT_PUBLIC_MUNICIPIO` escolhe no build e
  `tests/frontend-municipios.test.js` falha se a cópia envelhecer.
+ Os endereços das fontes oficiais vêm do mesmo arquivo: domínios da Prefeitura, da Câmara e do site,
  e a origem do Portal da Transparência (`portalTransparencia`). O backend lê por `src/fontes.js` e o
  frontend por `frontend/lib/ente.js`; `tests/fontes-sem-host.test.js` falha se o domínio de um
  município real voltar a ser escrito à mão no código de produção.
− Os caminhos e IDs de página dentro de cada fonte (`INT_PAG`, `/ws_consulta/...`) seguem nos
  coletores: são do fornecedor, e entram no contrato `Coletor`.
− Textos de página e scripts históricos ainda citam Ritápolis (mapa, seções 2.4–2.8).
