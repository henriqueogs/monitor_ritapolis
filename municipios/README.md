# Municípios

Cada pasta aqui é um município que este repositório sabe servir (ADR 0007,
[`docs/adr/0007-repositorio-modelo.md`](../docs/adr/0007-repositorio-modelo.md)). A instalação escolhe
um pela variável de ambiente `MUNICIPIO` (padrão: `ritapolis`).

| Pasta | O que é |
|---|---|
| `ritapolis/` | Instância de referência, em produção em ritapolis.com |
| `_exemplo/` | Modelo para copiar; valores fictícios |

## Adicionar um município

1. Copie `_exemplo/` para `municipios/<slug>/` (slug em minúsculas, sem acento; ex.: `sao-joao-del-rei`).
2. Edite `municipio.json`: o campo `slug` precisa ser igual ao nome da pasta. Nome com acento, UF, nome
   da UF, código IBGE (7 dígitos) e CNPJs da Prefeitura e da Câmara (só dígitos). O editor valida pelo
   `municipio.schema.json`.
3. No `.env`, defina `MUNICIPIO=<slug>`.
4. Rode `npm test`: `src/municipio.test.js` confere todas as pastas daqui contra o schema.

Para ver o projeto funcionando antes de configurar uma cidade, `docker compose up --build` sobe o
`_exemplo/` com documentos fictícios (`npm run seed:exemplo`, que recusa rodar em município real).

Valor inválido derruba a API na subida, com o nome do campo: um CNPJ errado nunca vira número errado em
silêncio.

## O que ainda não vem daqui

Hoje o arquivo cobre só a identidade. Ainda estão no código, presos a Ritápolis: os endereços das fontes
(coletores do site, do portal da transparência e da Câmara), os textos de página do frontend e o espelho
em `frontend/lib/ente.js`. O inventário completo está em
[`docs/MAPA_GENERICO_VS_RITAPOLIS.md`](../docs/MAPA_GENERICO_VS_RITAPOLIS.md).
