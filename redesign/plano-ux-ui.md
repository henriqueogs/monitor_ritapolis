# Plano UX/UI — Monitor Ritápolis v0.3

**Escopo:** redesenhar o Monitor Ritápolis como uma plataforma de **inteligência pública verificável**: simples, atraente e direta para o público geral, mas sustentada por dados reais, fontes oficiais, resumos de IA auditáveis e uma trilha clara do que ainda depende de integração futura.

**Data:** 13 de maio de 2026  
**Autor:** Time de produto  
**Status:** Proposta revisada para orientar próximos passos

---

## 1. Direção de produto

O Monitor Ritápolis não deve ser percebido como um gerenciador de arquivos públicos. O acervo continua essencial como lastro de auditoria, mas o coração do produto passa a ser: **entender o que está acontecendo no sistema público municipal, por que importa, quais evidências sustentam a leitura e o que ainda não pode ser afirmado com os dados atuais.**

A experiência pública deve responder perguntas como:

- O que mudou nos últimos dias?
- Quais temas aparecem com mais frequência?
- Que documentos têm resumo de IA disponível?
- Quais análises são baseadas em fonte oficial?
- Onde há dado incompleto, ausência de arquivo, texto não extraído ou baixa confiança?
- O que ainda depende de PNCP, portal de transparência, contratos, despesas ou deduplicação?

Princípios do redesign:

1. **Entendimento primeiro.** A home comunica acontecimentos, análises e sinais relevantes; a lista de documentos é uma camada de consulta e validação.
2. **Fonte oficial sempre visível.** Toda análise deve apontar para documentos, trechos, dados extraídos ou origem operacional.
3. **IA como leitura auditável.** A IA pode resumir, classificar, comparar e explicar, mas precisa diferenciar fato extraído, inferência, cálculo e dado ausente.
4. **Nada fingido como real.** Mock é permitido apenas no protótipo, rotulado como demonstrativo e com plano claro de substituição.
5. **Simplicidade comunicativa.** A interface deve ser mais atraente que um portal institucional tradicional, sem virar dashboard corporativo genérico.
6. **Evolução em camadas.** O design precisa funcionar com os dados reais existentes e já prever onde entram integrações futuras.

---

## 2. Estado real dos dados

### 2.1 Base real disponível hoje

Dados e capacidades já existentes no projeto, conforme `DEVELOPMENT_PLAN.md` e `CURRENT_WORK.md`:

- Banco SQLite local com documentos, fontes relacionadas, licitações, logs de coleta, resumos IA e jobs IA.
- Coleta real da Prefeitura e da Câmara.
- Base atual aproximada:
  - 592 documentos locais;
  - 520 licitações/editais;
  - dados predominantes da Prefeitura e cobertura inicial da Câmara.
- Extração de texto para anexos oficiais em PDF, DOCX e DOC.
- API Express com endpoints:
  - `GET /api/health`;
  - `GET /api/documentos`;
  - `GET /api/documentos/:id`;
  - `GET /api/licitacoes`;
  - `GET /api/estatisticas`;
  - `GET /api/painel-cidadao`;
  - `GET /api/coletas/log`;
  - `GET /api/cobertura/prefeitura`;
  - `GET /api/analises/resumos`;
  - `GET /api/ia/health`;
  - `GET /api/ia/resumos/status`;
  - `GET /api/ia/resumos/jobs`;
  - `GET /api/ia/resumos/jobs/:id`;
  - `POST /api/documentos/:id/resumir`;
  - `POST /api/ia/resumos/jobs/lote`;
  - `POST /api/ia/resumos/jobs/recover`.
- Resumos IA reais com:
  - provider NVIDIA;
  - fila assíncrona;
  - status de jobs;
  - confiança;
  - modelo;
  - hash do texto;
  - contrato de resposta;
  - modo direto/chunking.
- Indicadores de qualidade já expostos na API:
  - `indicadores.tem_pdf`;
  - `indicadores.tem_texto_extraido`;
  - `indicadores.tem_resumo_ai`;
  - `indicadores.dados_incompletos`;
  - `qualidade_alertas`;
  - `origem_resumo`.

### 2.2 Análises possíveis agora com dados reais

Estas experiências podem ser desenhadas e implementadas sem inventar dados:

- Painel de publicações recentes por ano, tipo e fonte.
- Destaque para documentos com resumo IA disponível.
- Lista de documentos pendentes de IA ou com texto extraído.
- Alertas de qualidade: sem data, sem arquivo oficial, erro de extração, dados incompletos.
- Leitura consolidada de resumos IA já gerados.
- Cobertura inicial da Prefeitura e da Câmara.
- Validação de cada resumo pelo hash, modelo, confiança e fonte oficial.
- Detalhe do documento com arquivo oficial, texto extraído, resumo IA e limitações.

### 2.3 Dados necessários para a nova visão

Para chegar à plataforma de inteligência pública completa, ainda é necessário criar ou integrar:

- PNCP como fonte prioritária para contratações públicas.
- Portal de transparência da Prefeitura.
- Contratos, despesas, receitas, empenhos, liquidações e pagamentos.
- Fornecedores, vencedores, CNPJ, valores finais e histórico de participação.
- Deduplicação entre site oficial, Câmara, PNCP e portal de transparência.
- Entidades consolidadas:
  - fornecedor;
  - órgão;
  - tema;
  - processo;
  - fonte;
  - documento relacionado;
  - evento público.
- Classificação temática confiável por Educação, Saúde, Obras, Administração, Licitações, Câmara etc.
- Evidências estruturadas por análise, vinculando conclusão, fonte, trecho, cálculo e confiança.

### 2.4 Matriz de disponibilidade

| Experiência / componente | Situação | Fonte atual | Observação |
|---|---|---|---|
| Home com insights recentes | Implementável agora com dados reais | `/api/painel-cidadao`, `/api/documentos`, `/api/analises/resumos` | Começar com fatos simples: novos documentos, resumos disponíveis, alertas de qualidade. |
| Análises baseadas em resumos IA | Implementável agora com dados reais | `/api/analises/resumos` | Não afirmar padrões amplos sem cobertura suficiente. |
| Acervo consultável | Implementável agora com dados reais | `/api/documentos`, `/api/licitacoes` | Continua como camada de consulta e auditoria. |
| Detalhe com fonte e validação | Implementável agora com dados reais | `/api/documentos/:id` | Mostrar fonte oficial, texto extraído, resumo IA, confiança e limitações. |
| Temas públicos | Implementável parcialmente | tipo, título, resumo, texto extraído | Classificação temática avançada depende de nova extração/IA. |
| Fornecedores e vencedores | Dependente de nova integração | futuro PNCP/transparência | Só usar mock no protótipo, sem contagem real. |
| Despesas, receitas e contratos | Dependente de nova integração | futuro portal de transparência | Não apresentar como dado real antes da coleta. |
| Comparações de gasto e risco | Dependente de nova integração | futuro PNCP/transparência + deduplicação | Exige dados financeiros confiáveis e rastreáveis. |
| Mapa de relações | Mock temporário permitido | demonstrativo | Deve indicar qual entidade real substituirá cada relação. |

---

## 3. Arquitetura de informação

### Área pública

```
/                       Painel de insights: o que aconteceu, por que importa, evidências
/analises               Leituras consolidadas por IA, com fonte, confiança e limitações
/temas                  Hubs por tema (Educação, Saúde, Obras, Licitações, Câmara etc.)
/acervo                 Consulta e auditoria da base: documentos, tipos, anos, fontes
/acervo?tipo=...        Mesma página, filtro pré-selecionado
/documento/:id          Fonte oficial, resumo IA, texto extraído, validação e evidências
/transparencia          Painel agregado do que já existe, com lacunas explícitas
/sobre                  Como funciona, fontes, IA, validação, limitações e contato
```

### Área administrativa / operacional

```
/admin                  Visão geral operacional
/admin/coletas          Histórico de execuções
/admin/ia               Fila, jobs, cobertura e revisão de resumos
/admin/cobertura        Comparação fonte oficial × base local
/admin/qualidade        Alertas técnicos e lacunas de dados
```

Enquanto não houver autenticação, as telas operacionais podem existir, mas devem usar linguagem de operação e não competir com a experiência pública.

### Migração das rotas atuais

| Hoje | Direção |
|---|---|
| `/` | Vira painel de insights com dados reais disponíveis. |
| `/documentos` | Mantém valor atual, mas migra gradualmente para `/acervo`. |
| `/licitacoes` | Mantém valor atual, mas vira recorte de `/acervo` e tema Licitações. |
| `/documento/[id]` | Mantém rota e ganha validação, evidências e distinção entre fato/IA/ausência. |
| `/estatisticas` | Vira `/transparencia`, com dados disponíveis e lacunas. |
| `/analises` | Torna-se uma área pública central, não apenas tela administrativa. |
| `/ia` | Migra para operação/admin; resumos úteis aparecem publicamente via `/analises` e detalhe. |
| `/cobertura` | Migra para `/admin/cobertura`, com resumo público em `/transparencia`. |

---

## 4. Política de mocks e dados demonstrativos

Mocks são úteis para desenhar o futuro, mas perigosos em um produto de transparência. A regra é: **mock pode mostrar intenção de interface; nunca pode parecer evidência real.**

### 4.1 Regras obrigatórias

- Todo mock visível no protótipo deve ter rótulo: **dados demonstrativos**.
- Todo mock no HTML/CSS/JS deve ter comentário:

```html
<!-- MOCK: remover quando [endpoint/tabela/integração] estiver disponível. -->
```

- O plano deve indicar qual dado real substituirá o mock.
- Mock não entra em:
  - contagem real;
  - cobertura;
  - confiança;
  - validação;
  - status de análise;
  - indicadores públicos.
- Produção não deve exibir mock. Se uma integração não existir, a interface mostra estado vazio, aviso de indisponibilidade ou “dados ainda não integrados”.

### 4.2 Mocks permitidos

| Mock | Permitido onde | Substituição real |
|---|---|---|
| Insights de fornecedor | Protótipo de `/temas` ou `/analises` | PNCP + portal de transparência + entidade `fornecedor`. |
| Gráficos de despesas | Protótipo de `/transparencia` | Coleta de despesas/receitas/contratos. |
| Mapa de temas | Protótipo da navegação | Classificação temática por regras + IA revisável. |
| Relações entre documentos | Protótipo do detalhe | Deduplicação e tabela de documentos relacionados. |

### 4.3 Mocks proibidos

- Fingir validação real.
- Misturar resumo mock com resumo IA real.
- Apresentar fornecedor, valor final, vencedor, gasto, risco ou irregularidade como fato sem fonte.
- Usar mock para aumentar número de cobertura, confiança ou indicadores.
- Esconder que um dado depende de integração futura.

### 4.4 Componentes de transparência de disponibilidade

- `MockNotice`: etiqueta visual discreta para dado demonstrativo.
- `DataAvailabilityBadge`: indica “real”, “parcial”, “pendente de integração” ou “demonstrativo”.
- `SourceTrace`: mostra de onde veio o dado, quando foi coletado e se há texto extraído.
- `ValidationStatus`: diferencia validado por fonte, IA com evidência, pendente, incompleto e demonstrativo.

---

## 5. Design system

### 5.1 Direção visual

A interface deve ser moderna, clara e comunicativa, sem ficar presa à estética de portal governamental tradicional. O tom visual desejado é:

- editorial, para explicar o que importa;
- analítico, para mostrar relações e evidências;
- simples, para não intimidar o público geral;
- confiável, para não parecer marketing nem painel especulativo.

Evitar:

- hero institucional grande demais;
- grade de KPI cards como primeira resposta para tudo;
- excesso de pílulas, badges e uppercase;
- “gerenciador de arquivos” como centro visual;
- efeitos decorativos sem função;
- aparência de dashboard SaaS genérico.

### 5.2 Paleta

A paleta pode manter a base atual, mas o azul institucional deve ser cor funcional, não atmosfera visual dominante.

| Token | Valor | Uso |
|---|---:|---|
| `--color-brand-500` | `#1351b4` | Ação primária, link, foco, fonte validada. |
| `--color-accent-500` | `#168821` | Evidência confirmada, status positivo. |
| `--color-bg` | `#f5f7fa` | Fundo geral. |
| `--color-surface` | `#ffffff` | Painéis e blocos de conteúdo. |
| `--color-text` | `#0f172a` | Texto principal. |
| `--color-text-soft` | `#475569` | Texto secundário. |
| `--color-line` | `#dde3ec` | Bordas e divisores. |
| `--color-warn` | `#b7791f` | Dados incompletos ou pendentes. |
| `--color-demo` | `#7c3aed` | Dados demonstrativos/mock. |

### 5.3 Tipografia e composição

- Tipografia clara, com corpo mínimo de 16px.
- Títulos curtos e diretos; evitar chamadas decorativas.
- Blocos de análise devem privilegiar conclusão, contexto e evidência.
- Texto de interface deve evitar jargão técnico: usar “arquivo oficial” em vez de assumir PDF.
- Metadados técnicos ficam em disclosure, detalhe ou área administrativa.

### 5.4 Motion e exibição

Motion deve ajudar a entender relações e estados, não enfeitar.

Tokens:

- `--motion-fast: 100ms` para hover/foco;
- `--motion-base: 160ms` para troca de estado;
- `--motion-slow: 260ms` para abrir/fechar painéis;
- curva: `cubic-bezier(0.16, 1, 0.3, 1)`;
- suporte obrigatório a `prefers-reduced-motion`.

Usar motion para:

- expandir evidências em `EvidenceDrawer`;
- revelar fontes usadas em `SourceTrace`;
- alternar entre conclusão, dados e documentos;
- destacar trecho-fonte quando o usuário clica em uma evidência;
- indicar carregamento, geração ou validação;
- remover filtros com transição de opacidade e altura.

Evitar:

- parallax;
- bounce;
- zoom dramático;
- cards que pulam no hover;
- animação contínua;
- transição que esconda mudança de dado real.

### 5.5 Componentes principais

| Componente | Função | Dados |
|---|---|---|
| `TopBar` | Navegação pública simples: Início, Análises, Temas, Acervo, Sobre. | Real. |
| `InsightCard` | Mostra acontecimento ou leitura relevante com CTA para evidências. | Real agora; mock só com `MockNotice`. |
| `EvidenceDrawer` | Abre fontes, trechos, documentos e limitações da análise. | Real ou parcial. |
| `ValidationStatus` | Indica fonte validada, IA com evidência, incompleto, pendente ou demonstrativo. | Real/parcial/mock rotulado. |
| `SourceTrace` | Mostra origem, arquivo oficial, data de coleta, hash/resumo quando aplicável. | Real. |
| `DataAvailabilityBadge` | Explica se a informação existe hoje ou depende de integração. | Real. |
| `TopicHub` | Agrupa documentos/análises por tema. | Parcial agora; futuro com classificação. |
| `AskPublicAI` | Busca/pergunta orientada por evidências. | Futuro; não prometer respostas sem backend. |
| `DocCard` | Cartão de documento como fonte auditável. | Real. |
| `AICallout` | Aviso de conteúdo gerado por IA, com confiança e fonte. | Real. |
| `MockNotice` | Rótulo obrigatório de dados demonstrativos. | Apenas protótipo. |
| `AdminSidebar` | Operação de coletas, IA, cobertura e qualidade. | Real/admin. |

---

## 6. Especificação por tela

### 6.1 Home (`/`)

**Objetivo:** em 5 segundos, comunicar: “aqui eu entendo o que está acontecendo no sistema público local, com evidências”.

Blocos:

1. **Painel de insights reais**
   - Publicações relevantes recentes.
   - Resumos IA recém-gerados.
   - Documentos com alertas de qualidade.
   - Mudanças por ano/tipo/fonte quando disponíveis.
   - Cada item deve ter “ver evidências”.

2. **Pergunta ou busca orientada**
   - Campo único para buscar assunto, número, órgão ou termo.
   - Em v0.3, busca leva para acervo/análises existentes.
   - Se houver componente conversacional no protótipo, rotular como dependente de backend futuro.

3. **Temas em destaque**
   - Inicialmente derivados de tipos, títulos e resumos.
   - Se usar categorias como Educação, Saúde ou Obras sem classificador real, usar `DataAvailabilityBadge: parcial`.

4. **Qualidade e cobertura em linguagem pública**
   - Quantos documentos têm arquivo oficial.
   - Quantos têm texto extraído.
   - Quantos têm resumo IA.
   - Quais lacunas existem.

Não usar como conteúdo principal: botão de executar coleta, fila bruta de IA, logs técnicos ou status operacional detalhado.

### 6.2 Análises (`/analises`)

**Objetivo:** reunir leituras geradas ou apoiadas por IA, sempre com evidência.

Conteúdo implementável agora:

- Resumos IA disponíveis.
- Confiança, modelo, data e hash de compatibilidade.
- Fonte oficial do documento.
- Alertas quando a cobertura ainda for baixa.

Estrutura de cada análise:

1. Conclusão curta.
2. Por que importa.
3. Evidências usadas.
4. Status de validação.
5. Limitações: dado ausente, baixa confiança, texto incompleto, fonte única.

Não apresentar como análise consolidada:

- comparação de fornecedores sem dados de fornecedor;
- risco financeiro sem despesas/contratos;
- valor final sem portal de transparência/PNCP;
- padrão temporal sem série suficiente.

### 6.3 Temas (`/temas`)

**Objetivo:** permitir navegação por assuntos públicos, não apenas por tipo documental.

Estado inicial:

- Implementável parcialmente com busca por termos, tipo e resumo.
- Usar temas como agrupamento assistido, não como classificação definitiva.

Estados por tema:

- **Real:** tema derivado de filtro explícito ou tipo existente.
- **Parcial:** tema inferido por título/resumo/texto.
- **Pendente:** tema depende de classificador ou integração.
- **Demonstrativo:** apenas protótipo, com `MockNotice`.

Temas sugeridos:

- Educação;
- Saúde;
- Obras;
- Licitações;
- Câmara;
- Administração;
- Assistência social;
- Transporte.

### 6.4 Acervo (`/acervo`)

**Objetivo:** consulta e auditoria da base, não o centro narrativo do produto.

Deve incluir:

- Busca e filtros por ano, tipo, fonte e qualidade.
- Documentos e licitações em lista única quando possível.
- Sinais visuais:
  - arquivo oficial disponível;
  - texto extraído;
  - resumo IA;
  - dados incompletos;
  - erro de extração.
- Acesso rápido ao detalhe e à fonte oficial.

Rotas antigas `/documentos` e `/licitacoes` podem continuar durante a transição, mas a documentação deve tratá-las como vistas legadas ou recortes do acervo.

### 6.5 Documento (`/documento/:id`)

**Objetivo:** ser a unidade de prova do sistema.

Estrutura:

1. Header com título, tipo, fonte, data e status de qualidade.
2. Ação primária para abrir o arquivo oficial quando existir.
3. Resumo IA quando disponível, com `AICallout`.
4. `ValidationStatus` com confiança, modelo, hash e compatibilidade.
5. `EvidenceDrawer` com trechos, texto extraído e campos identificados.
6. `SourceTrace` com URL, data de coleta e origem.
7. Dados ausentes ou incompletos claramente sinalizados.
8. Documentos relacionados apenas quando houver relação real; se for mock, rotular.

Campos técnicos como provider, contrato, hash completo e chunks podem aparecer em modo “detalhes técnicos” ou `/admin/ia`, mas não como leitura principal do público.

### 6.6 Transparência (`/transparencia`)

**Objetivo:** explicar cobertura, volume e lacunas.

Mostrar:

- total por tipo, fonte e ano;
- cobertura de texto extraído;
- cobertura de resumos IA;
- documentos com problema;
- última coleta conhecida;
- fontes integradas e fontes pendentes.

Gráficos de despesas, contratos ou fornecedores só entram com dados reais ou como mock explícito no protótipo.

### 6.7 Área administrativa (`/admin/*`)

**Objetivo:** operação da plataforma.

Inclui:

- fila de IA;
- jobs;
- logs;
- cobertura;
- qualidade;
- coleta manual;
- erros de extração;
- rotina operacional.

A linguagem deve ser técnica e densa. Não misturar com a promessa pública do produto.

---

## 7. Acessibilidade e confiança

- Contraste mínimo WCAG AA.
- Skip link visível ao focar.
- Foco visível em links, botões, filtros, abas e disclosures.
- `prefers-reduced-motion` obrigatório.
- Nenhuma informação crítica depende apenas de cor.
- Toda análise deve informar:
  - fonte;
  - evidência;
  - confiança ou status;
  - limitações;
  - dado ausente quando houver.
- Estados vazios devem explicar o motivo: “ainda não integrado”, “sem documento com resumo IA”, “fonte indisponível”, “dado incompleto”.

---

## 8. Roadmap de implementação

### Fase 1 — Redesenhar com dados reais existentes

- Atualizar home para painel de insights reais.
- Reposicionar `/analises` como área pública de leitura consolidada.
- Melhorar detalhe com `SourceTrace`, `ValidationStatus` e evidências.
- Manter acervo como consulta/auditoria.
- Exibir cobertura de IA e qualidade em linguagem pública.

Critério de pronto:

- Nada na experiência principal depende de mock.
- Usuário entende o que é fonte, IA, evidência e limitação.

### Fase 2 — Estruturar base para inteligência

- Criar modelo de entidades e relações.
- Estruturar evidências por análise.
- Melhorar classificação por tema.
- Melhorar extração de modalidade, objeto, datas, valores e status.
- Preparar deduplicação sem apagar rastreabilidade.

Critério de pronto:

- A plataforma consegue relacionar documento, fonte, tema, resumo e evidência.

### Fase 3 — Integrar fontes necessárias

- Implementar PNCP.
- Implementar portal de transparência.
- Coletar contratos, despesas, receitas, fornecedores e vencedores.
- Relacionar processos entre fontes.

Critério de pronto:

- Análises sobre fornecedor, valor final, contrato, despesa e comparação financeira usam dados reais.

### Fase 4 — Substituir mocks

- Remover dados demonstrativos do protótipo.
- Ligar componentes aos endpoints reais.
- Validar que nenhum mock aparece em produção.
- Criar checklist de busca por `MOCK:` antes de release.

Critério de pronto:

- `MockNotice` não aparece em produção.
- Todo componente analítico tem dado real, estado vazio ou aviso de integração pendente.

---

## 9. Referências e links úteis

- Querido Diário (OKBR): https://queridodiario.ok.org.br/
- Portal da Transparência Federal: https://portaldatransparencia.gov.br/
- Diário Oficial da União: https://www.in.gov.br/
- Gov.br Design System: https://www.gov.br/ds/
- GOV.UK Design System: https://design-system.service.gov.uk/
- USWDS: https://designsystem.digital.gov/
- WCAG 2.2: https://www.w3.org/TR/WCAG22/
- Heurísticas de Nielsen: https://www.nngroup.com/articles/ten-usability-heuristics/

---

## 10. Entregáveis deste plano

### Documentação

- `redesign/plano-ux-ui.md` — direção de produto, dados reais, mocks, telas e roadmap.
- Atualizações futuras em `DEVELOPMENT_PLAN.md` quando a estratégia for aprovada para implementação.

### Protótipo

- `prototype/index.html` — Home como painel de insights.
- `prototype/analises.html` — Análises com evidências e validação.
- `prototype/temas.html` — Temas com disponibilidade real/parcial/mock.
- `prototype/acervo.html` — Consulta e auditoria da base.
- `prototype/documento.html` — Fonte oficial, resumo IA, evidências e validação.
- `prototype/transparencia.html` — Cobertura, qualidade e lacunas.
- `prototype/sobre.html` — Como funciona, IA, fontes e limitações.
- `prototype/admin/index.html` — Visão geral operacional.
- `prototype/admin/{coletas,ia,cobertura,qualidade}.html` — Subpáginas admin.
- `prototype/assets/tokens.css` — Tokens.
- `prototype/assets/app.css` — Componentes.
- `prototype/assets/app.js` — Interações, disclosures, tabs e motion.

### Checklist de aceite

- O documento deixa explícito o que existe hoje e o que ainda precisa ser criado.
- Nenhum mock fica ambíguo.
- A nova visão preserva acervo, fonte oficial e auditabilidade.
- A home comunica: “aqui eu entendo o que está acontecendo no sistema público”.
- Toda análise diferencia fato extraído, inferência de IA, cálculo e dado ausente.
