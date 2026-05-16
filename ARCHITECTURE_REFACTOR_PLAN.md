# Plano de Refatoracao Arquitetural

## Monitor Ritapolis

Atualizado em: 2026-05-14.

Este plano define a arquitetura-alvo para reduzir arquivos grandes, remover duplicacoes e criar uma base de codigo mais previsivel para as proximas etapas do Monitor Ritapolis.

---

## 1. Objetivo

Organizar o projeto para que cada pagina tenha responsabilidade clara, componentes reaproveitaveis, estilos localizados e testes proximos do comportamento que validam.

Principios:

- a pagina orquestra dados e composicao;
- componentes cuidam de apresentacao e interacao;
- regras de negocio ficam em modulos de dominio, nao misturadas ao JSX;
- estilos globais ficam restritos a tokens, reset, layout base e componentes realmente compartilhados;
- endpoints de lista retornam dados resumidos, e detalhes retornam dados completos;
- cada refatoracao preserva comportamento antes de mudar experiencia visual.

---

## 2. Convencao de Pastas

Cada rota deve evoluir para uma pasta com esta estrutura:

```text
frontend/app/<rota>/
|-- page.js              # compatibilidade com Next.js App Router
|-- index.js             # composicao principal da pagina
|-- styles.module.css    # estilos especificos da pagina
|-- page.test.js         # testes da pagina
`-- components/          # componentes privados da pagina, quando necessario
```

Para rotas dinamicas:

```text
frontend/app/documento/[id]/
|-- page.js
|-- index.js
|-- styles.module.css
|-- page.test.js
`-- components/
```

`page.js` deve ficar pequeno. O ideal e importar e renderizar a composicao:

```js
import DocumentoPage from './index';

export default DocumentoPage;
```

---

## 3. Camadas do Frontend

Estrutura recomendada:

```text
frontend/app/
|-- components/          # componentes compartilhados de UI
|-- lib/                 # clientes, formatadores, helpers puros
|-- domain/              # regras de apresentacao por dominio
|-- admin/               # rotas operacionais
|-- documento/[id]/      # rota com pasta propria
|-- documentos/          # rota com pasta propria
|-- licitacoes/          # rota com pasta propria
|-- analises/            # rota com pasta propria
|-- temas/               # rota com pasta propria
|-- transparencia/       # rota com pasta propria
`-- styles/              # tokens e estilos base compartilhados
```

Componentes compartilhados devem ser pequenos e nomeados pelo papel real:

- `DocumentRow`;
- `QualitySignals`;
- `SourceTrace`;
- `StatusBadge`;
- `Pagination`;
- `FilterBar`.

Componentes especificos de uma tela devem ficar dentro da pasta da propria rota ate provarem reuso real.

---

## 4. SOLID Aplicado ao Projeto

### Single Responsibility

- Pagina nao deve buscar dados, montar filtros, renderizar varias secoes e conter estilos inline extensos ao mesmo tempo.
- Componentes como `DocumentRow` nao devem conhecer detalhes de endpoint.
- Funcoes de formatacao ficam em `lib/format.js`.

### Open/Closed

- Novos sinais de qualidade devem entrar por uma funcao central, sem reescrever cada card.
- Novos tipos de fonte devem ser adicionados por mapeamento, nao por condicionais espalhadas.

### Liskov Substitution

- Componentes de lista devem aceitar itens normalizados. Um documento vindo de `/documentos` e um edital vindo de `/licitacoes` precisam ter contrato compativel para renderizacao basica.

### Interface Segregation

- Listas devem receber resumo do documento, nao o documento completo.
- Detalhe deve receber texto completo, fontes relacionadas, resumo IA e dados tecnicos.

### Dependency Inversion

- Paginas dependem de funcoes de API em `lib/api.js`, nao de `fetch` espalhado.
- Componentes dependem de dados ja preparados, nao de chamadas remotas.

---

## 5. Arquivos Grandes e Prioridade

Estado observado em 2026-05-14:

| Arquivo | Problema | Prioridade |
|---|---|---|
| `frontend/app/globals.css` | concentra praticamente todos os estilos | Alta |
| `frontend/app/documento/[id]/page.js` | detalhe muito grande, mistura secoes e transformacoes | Alta |
| `frontend/app/page.js` | home mistura hero, analises, graficos e listas | Alta |
| `frontend/app/ia/page.js` | operacao de IA concentrada em uma pagina extensa | Media |
| `frontend/app/lib/api.js` | cliente e fallbacks crescendo no mesmo arquivo | Media |
| `src/db/index.js` | muitas consultas e normalizacoes no mesmo modulo | Alta |

Status em 2026-05-14:

- todas as rotas em `frontend/app` ja possuem `page.js`, `index.js`, `styles.module.css` e `page.test.js`;
- todos os `page.js` sao pontes curtas para o `index.js` da rota;
- home, documentos, licitacoes, analises, temas e estatisticas ja tiveram componentes locais extraidos;
- `documento/[id]/index.js` foi decomposto em componentes locais para cabecalho, resumo/fonte, identificacao, IA, licitacao, fontes relacionadas e texto tecnico;
- `ia/index.js` foi decomposto em componentes locais para filtros, cobertura, pendencias, acao de lote, fila e providers;
- estilos especificos de `documento/[id]` e `ia` foram migrados de `globals.css` para CSS Modules das rotas;
- classes globais de grid/status/metrica (`content-grid`, `status-list`, `status-row`, `stats-grid`, `stat-box`) foram migradas para CSS Modules das rotas restantes;
- `/cobertura` passou a tratar falha de consulta externa como estado de indisponibilidade rastreavel, evitando 500 na experiencia administrativa/publica;
- cobertura da Prefeitura passou a ser baseada em areas oficiais com URL publica e URL tecnica separadas, mantendo compatibilidade com dados antigos;
- sincronizacao automatica da Prefeitura foi isolada em `src/coletas/prefeitura-sync.js` e acionada por um componente de entrada da home, sem misturar regra de coleta no JSX;
- `globals.css` ainda concentra estilos compartilhados demais de componentes reaproveitaveis e deve ser reduzido gradualmente.

---

## 6. Plano de Migracao

### Fase 1 - Contratos e redundancias

- Garantir que endpoints de lista nao retornem `texto_completo`.
- Separar payload de lista e payload de detalhe.
- Documentar quais campos cada tela usa.
- Remover duplicacoes visiveis na home e nas telas publicas.

### Fase 2 - Home como prova de arquitetura

- Criar `frontend/app/(public)/` somente se a organizacao de rotas exigir.
- Migrar a home para:
  - `frontend/app/_home/index.js`;
  - `frontend/app/_home/styles.module.css`;
  - `frontend/app/_home/components/`.
- Remover estilos inline da home.
- Manter `page.js` como ponte.

Status em 2026-05-14:

- `frontend/app/page.js` ja virou ponte para `./_home`;
- composicao principal criada em `frontend/app/_home/index.js`;
- estilos especificos iniciais criados em `frontend/app/_home/styles.module.css`;
- componentes locais criados em `frontend/app/_home/components/`;
- contrato inicial registrado em `frontend/app/_home/page.test.js`;
- ainda falta reduzir dependencias de classes globais herdadas pela home.

### Fase 3 - Detalhe do documento

- Dividir `documento/[id]/page.js` em:
  - cabecalho;
  - resumo;
  - validacao/fonte;
  - identificacao;
  - licitacao;
  - fontes relacionadas;
  - texto completo;
  - dados tecnicos.
- Mover preparacao de dados para helper puro.
- Adicionar teste cobrindo documento com e sem resumo IA.

### Fase 4 - Acervo e licitacoes

- Unificar filtros e paginacao onde houver contrato comum.
- Remover duplicacao de busca, ano, fonte e qualidade.
- Consolidar lista de documentos como componente base.

### Fase 5 - Admin

- Manter admin separado da experiencia publica.
- Colocar componentes de operacao em `frontend/app/admin/components`.
- Evitar importar componentes publicos quando a linguagem operacional for diferente.

### Fase 6 - Backend

- Separar `src/db/index.js` por responsabilidade:
  - `documentos-repository`;
  - `licitacoes-repository`;
  - `estatisticas-repository`;
  - `ia-repository`;
  - `coletas-repository`;
  - `normalizers`.
- Manter uma camada publica de exportacao para nao quebrar a API de uma vez.

---

## 7. Testes

Padrao inicial:

- `page.test.js` para cada pagina migrada;
- testes de helpers em `*.test.js` ao lado do helper;
- primeiro foco em renderizacao de estados:
  - com dados;
  - vazio;
  - dado incompleto;
  - erro/fallback;
  - modo admin quando aplicavel.

Antes de adicionar ferramenta nova de teste, decidir entre:

- Jest/Vitest para unidade e componentes;
- Playwright para fluxo de navegador;
- testes de API com Node nativo para repositorios.

---

## 8. Criterios de Pronto

Uma refatoracao so conta como concluida quando:

- build passa;
- comportamento publico permanece equivalente ou melhor;
- payload de lista nao carrega campos gigantes;
- estilos especificos saem do global quando possivel;
- a pagina migrada tem `index`, `styles` e `test`;
- o `CURRENT_WORK.md` registra o que mudou.
