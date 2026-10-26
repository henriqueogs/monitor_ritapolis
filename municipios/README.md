# Municípios

Cada pasta aqui é um município que este repositório sabe servir (ADR 0007,
[`docs/adr/0007-repositorio-modelo.md`](../docs/adr/0007-repositorio-modelo.md)). A instalação escolhe
um pela variável de ambiente `MUNICIPIO` (padrão: `ritapolis`).

| Pasta        | O que é                                               |
| ------------ | ----------------------------------------------------- |
| `ritapolis/` | Instância de referência, em produção em ritapolis.com |
| `_exemplo/`  | Modelo para copiar; valores fictícios                 |

## Adicionar um município

O guia completo, com variáveis de ambiente, fontes e primeira coleta, está em
[`docs/ADICIONAR_MUNICIPIO.md`](../docs/ADICIONAR_MUNICIPIO.md). Resumo:

1. Copie `_exemplo/` para `municipios/<slug>/` (slug em minúsculas, sem acento; ex.: `sao-joao-del-rei`).
2. Edite `municipio.json`: o campo `slug` precisa ser igual ao nome da pasta. Nome com acento, UF, nome
   da UF, código IBGE (7 dígitos), CNPJs da Prefeitura e da Câmara (só dígitos), marca, domínios do
   site, da Prefeitura e da Câmara, e a origem do Portal da Transparência (`portalTransparencia`, com
   `https://`). O editor valida pelo `municipio.schema.json`.
3. Rode `npm run municipio:frontend`: copia os municípios para `frontend/lib/municipios.json`, que é o
   que o site lê (o Next não enxerga fora de `frontend/`). O teste falha se você esquecer.
4. No `.env` da API, defina `MUNICIPIO=<slug>`; no build do site, `NEXT_PUBLIC_MUNICIPIO=<slug>`.
5. Rode `npm test`: `src/municipio.test.js` confere todas as pastas daqui contra o schema.

Para ver o projeto funcionando antes de configurar uma cidade, `docker compose up --build` sobe o
`_exemplo/` com documentos fictícios (`npm run seed:exemplo`, que recusa rodar em município real).

Valor inválido derruba a API na subida, com o nome do campo: um CNPJ errado nunca vira número errado em
silêncio.

## O que ainda não vem daqui

O arquivo cobre a identidade, a marca e os endereços das fontes (os coletores leem por `src/fontes.js`).
Ainda estão no código, presos a Ritápolis: os IDs de página e caminhos de cada fonte, que são do
fornecedor do sistema (entram no contrato `Coletor`), e alguns textos de página do frontend (destaque
da home, contexto da cidade com população e gentílico). O inventário completo está em
[`docs/MAPA_GENERICO_VS_RITAPOLIS.md`](../docs/MAPA_GENERICO_VS_RITAPOLIS.md).
