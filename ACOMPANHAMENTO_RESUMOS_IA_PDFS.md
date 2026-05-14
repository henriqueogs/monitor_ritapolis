# Acompanhamento - Resumos de PDFs com IA

## Monitor Ritapolis

Este documento acompanha a evolucao da tarefa de resumo de PDFs com IA no Monitor Ritapolis.

Objetivo: manter um checklist claro do que ja foi feito, do que foi validado e do que ainda precisa ser feito antes de considerar a funcionalidade pronta para uso continuo.

Regra principal da tarefa: a IA e uma camada de enriquecimento. Ela nao substitui o PDF original, nao altera campos oficiais da tabela `documentos` e nao deve ser tratada como fonte da verdade.

---

## 1. Status geral

- [x] Backend preparado para resumos com IA
- [x] Provider NVIDIA NIM configurado via endpoint OpenAI-compatible
- [x] Chave lida de `NVIDIA_API_KEY` no `.env`
- [x] Contrato de resposta validado com Zod
- [x] Resumos salvos em tabela propria
- [x] Cache por `documento_id + texto_hash + contrato_versao`
- [x] Scripts NPM criados
- [x] Endpoint `GET /api/documentos/:id` retornando `resumo_ai`
- [x] Validacao real com NVIDIA feita
- [x] Lote pequeno com NVIDIA validado parcialmente
- [x] Frontend exibindo resumo de IA na pagina de detalhe
- [x] Botao para gerar resumo quando ainda nao existe
- [x] Listagem de documentos organizada por ano
- [x] Base inicial de comparacao Prefeitura versus sistema
- [x] Pagina de cobertura validada no frontend com limite pequeno
- [x] Comando de status de resumos por ano/tipo
- [x] Dry-run para planejar lotes sem chamar IA
- [x] Filtros de lote por ano, tipo, fonte e tamanho do texto
- [x] Pagina `/ia` para acompanhar cobertura dos resumos
- [x] Pagina `/ia` mostra distribuicao por provider/modelo/status
- [x] Detalhe do documento mostra compatibilidade do resumo com o texto atual
- [x] Detalhe do documento mostra hash completo em area tecnica recolhida
- [x] Provider mock removido do fluxo operacional
- [x] Registros mock removidos do banco local
- [x] Healthcheck de IA operacional criado
- [x] Botao de gerar novamente com confirmacao de custo
- [x] Endpoint de resumo aceita regeneracao forcada
- [x] Tela evita gerar PDFs grandes pelo navegador para nao estourar timeout
- [x] Documento `4` gerado com sucesso pelo fluxo operacional em chunks
- [x] Fila assincrona inicial para resumos de IA criada em SQLite
- [x] Worker de jobs de resumo IA criado
- [x] Teste com documento grande usando chunking
- [ ] Revisao ampliada de qualidade dos resumos gerados em lote
- [ ] Avaliar se o modelo NVIDIA atual e o mais adequado
- [ ] Definir rotina segura para rodar IA no banco ja existente
- [x] Exibir fila de jobs de IA na pagina `/ia`
- [x] Recuperar jobs presos em `processando`

---

## 2. O que ja foi feito

### 2.1 Preparacao do projeto

- [x] Instaladas dependencias:
  - `openai`
  - `zod`
  - `p-limit`
- [x] Adicionados scripts ao `package.json`:
  - `npm run ai:test`
  - `npm run ai:resumir`
  - `npm run ai:resumir-pendentes`
- [x] Adicionadas variaveis de IA ao `.env.example`.
- [x] Adicionados defaults seguros em `src/config.js`.
- [x] Mantido o comportamento dos coletores existentes.

Arquivos principais:

- `package.json`
- `package-lock.json`
- `.env.example`
- `src/config.js`

---

### 2.2 Banco de dados

- [x] Criada a tabela `documentos_resumos_ai`.
- [x] Criados indices para consulta por documento e hash.
- [x] Criada unicidade por:
  - `documento_id`
  - `texto_hash`
  - `contrato_versao`
- [x] Implementados helpers para salvar e consultar resumos.
- [x] Implementada busca do ultimo resumo valido por documento.

Tabela criada:

```sql
documentos_resumos_ai
```

Campos essenciais salvos:

- `documento_id`
- `provider`
- `modelo`
- `contrato_versao`
- `resumo_json`
- `texto_hash`
- `tokens_estimados`
- `status`
- `erro`
- `criado_em`
- `atualizado_em`

Arquivos principais:

- `src/db/schema.sql`
- `src/db/index.js`

---

### 2.3 Providers de IA

- [x] Criada interface base de provider.
- [x] Provider `mock` removido apos validacao real com NVIDIA.
- [x] Criado provider `nvidia` usando cliente OpenAI-compatible.
- [x] Criada factory `createAiProvider`.
- [x] Provider selecionado por `AI_PROVIDER`.

Provider disponivel hoje:

- `nvidia`

Provider padrao:

```env
AI_PROVIDER=nvidia
```

Arquivos principais:

- `src/ai/providers/base-provider.js`
- `src/ai/providers/nvidia-provider.js`
- `src/ai/providers/index.js`

---

### 2.4 Contrato, prompt e validacao

- [x] Criado contrato Zod para o JSON de resumo.
- [x] Criado prompt base para resumo de documento.
- [x] Criado prompt de consolidacao para documentos grandes.
- [x] Criado parser seguro para resposta JSON.
- [x] Tratado caso de resposta com markdown fences acidentais.
- [x] Resposta invalida nao e salva como resumo valido.

Arquivos principais:

- `src/ai/contracts/summary-contract.js`
- `src/ai/prompts/document-summary-prompt.js`
- `src/ai/validate-summary.js`

---

### 2.5 Fluxo de resumo de documento

- [x] Criada funcao `summarizeDocument(documentoId)`.
- [x] Documento e buscado por id.
- [x] `texto_completo` e validado antes da chamada de IA.
- [x] Hash SHA-256 e calculado a partir do texto.
- [x] Cache e verificado antes de chamar a IA.
- [x] Provider configurado e chamado quando necessario.
- [x] Resposta e validada com Zod.
- [x] Resumo validado e salvo em `documentos_resumos_ai`.
- [x] Reexecucao com mesmo texto reutiliza resumo salvo.

Arquivo principal:

- `src/ai/summarize-document.js`

---

### 2.6 PDFs grandes

- [x] Criado chunking por caracteres.
- [x] Criado overlap entre chunks.
- [x] Criada consolidacao final dos resumos parciais.
- [x] Criado limite de chunks por documento.
- [x] Erro controlado para documento que excede o limite.
- [x] Validar com um documento real acima de `AI_MAX_CHARS_DIRECT`.
- [x] Documento `161` validado com `80.048` caracteres, `3` chunks previstos, `tokens_estimados = 20012` e resumo salvo com NVIDIA.

Arquivos principais:

- `src/ai/chunk-text.js`
- `src/ai/summarize-document.js`
- `src/ai/prompts/document-summary-prompt.js`

---

### 2.7 Processamento em lote

- [x] Criada funcao `summarizePendingDocuments`.
- [x] Criado script `npm run ai:resumir-pendentes`.
- [x] Implementado limite por `--limite=N`.
- [x] Implementado filtro opcional por tamanho com `--max-chars=N`.
- [x] Implementada concorrencia baixa.
- [x] Erros por documento sao registrados sem interromper todo o lote.
- [x] Documentos ja resumidos com mesmo hash sao ignorados.
- [x] Validar lote pequeno com NVIDIA real.
- [ ] Definir limite operacional recomendado para uso manual.

Arquivos principais:

- `src/ai/summarize-pending-documents.js`
- `scripts/resumir-pendentes.js`

---

### 2.8 Scripts de operacao

- [x] Criado `scripts/ai-test.js`.
- [x] Criado `scripts/resumir-documento.js`.
- [x] Criado `scripts/resumir-pendentes.js`.

Comandos disponiveis:

```bash
npm run ai:test
npm run ai:resumir -- --documento-id=2
npm run ai:resumir-pendentes -- --limite=10
npm run ai:resumir-pendentes -- --limite=5 --max-chars=5000
```

---

### 2.9 API

- [x] `GET /api/documentos/:id` retorna `resumo_ai` quando existe resumo valido.
- [x] Retorno inclui metadados do resumo:
  - `provider`
  - `modelo`
  - `contrato_versao`
  - `criado_em`
  - `atualizado_em`
  - `dados`
- [x] API continua retornando documento mesmo quando nao existe resumo.
- [x] API validada em porta isolada retornando resumo NVIDIA.

Formato atual:

```json
{
  "resumo_ai": {
    "provider": "nvidia",
    "modelo": "meta/llama-3.1-70b-instruct",
    "contrato_versao": "1.0",
    "criado_em": "2026-05-12T21:22:03.062Z",
    "atualizado_em": "2026-05-12T21:22:03.062Z",
    "dados": {
      "resumo_cidadao": "...",
      "resumo_tecnico": "...",
      "confianca": 1
    }
  }
}
```

Arquivos principais:

- `src/db/index.js`
- `src/api/server.js`

---

## 3. Validacoes ja realizadas

### 3.1 Validacoes locais sem IA real

- [x] `npm install openai zod p-limit`
- [x] `npm run setup-db`
- [x] Carregamento dos modulos de IA e API
- [x] Validacoes antigas com `mock` foram substituidas por validacoes reais com NVIDIA.
- [x] Validacao do endpoint em porta isolada retornando `resumo_ai`

Observacoes:

- O documento `1` teve resumo `mock` removido durante a limpeza operacional.
- Uma execucao paralela do mesmo resumo gerou `database is locked`, comportamento esperado em SQLite quando ha concorrencia de escrita. O uso manual sequencial funcionou.

---

### 3.2 Validacao com NVIDIA real

- [x] `.env` atualizado com `NVIDIA_API_KEY`.
- [x] `npm run ai:test` passou com provider `nvidia`.
- [x] `npm run ai:resumir -- --documento-id=2` gerou resumo real.
- [x] Resumo do documento `2` foi salvo no banco com `status = ok`.
- [x] Segunda execucao do documento `2` retornou `Reutilizado: sim`.
- [x] Lote com `--limite=5 --max-chars=5000` salvou novos resumos NVIDIA antes do timeout externo da validacao.

Resultado confirmado:

```text
Provider: nvidia
Modelo: meta/llama-3.1-70b-instruct
Documento: 2
Status no banco: ok
```

Resumo cidadao gerado para o documento `2`:

```text
A Prefeitura Municipal de Ritapolis contratou a empresa Minas Med Hospitalar Ltda para fornecer camaras frias para armazenamento de vacinas.
```

Observacoes:

- A primeira tentativa de `npm run ai:test` sem permissao externa falhou com `Connection error`.
- A validacao passou ao permitir acesso de rede para a chamada externa.
- O modelo atual pode levar perto de 1 minuto por documento curto; lotes maiores podem precisar de mais tempo de execucao.

---

### 3.3 Validacao do frontend

- [x] Build de producao do frontend passou.
- [x] Pagina `GET /documento/2` renderizou a secao "Resumo gerado por IA".
- [x] HTML renderizado contem o modelo `meta/llama-3.1-70b-instruct`.
- [x] HTML renderizado contem aviso para conferir o documento original.

Comandos testados:

```bash
npm run build
```

Validacao local feita com:

```text
API: http://127.0.0.1:3011
Frontend: http://127.0.0.1:3002/documento/2
```

---

## 4. O que ainda precisa ser feito

### 4.1 Backend e operacao

- [x] Testar um documento grande que acione chunking.
- [x] Rodar `npm run ai:resumir-pendentes -- --limite=5 --max-chars=5000` com NVIDIA real.
- [x] Revisar manualmente uma amostra de 5 resumos gerados.
- [ ] Definir politica de uso:
  - limite recomendado por lote;
  - quando rodar o script;
  - se deve priorizar documentos recentes;
  - se deve priorizar licitacoes.
- [ ] Criar comando ou nota para listar documentos com resumo disponivel.
- [x] Resumos `mock` antigos foram removidos do banco local.

---

### 4.2 API

- [x] Validar `GET /api/documentos/:id` em ambiente isolado sem servidor antigo ocupando a porta.
- [ ] Decidir se a API deve ocultar `texto_completo` em algum modo futuro.
- [x] Criado endpoint manual:
  - `POST /api/documentos/:id/resumir`
- [x] Criado endpoint administrativo para listar status dos resumos.

---

### 4.3 Frontend

- [x] Adicionar bloco "Resumo gerado por IA" na pagina de detalhe.
- [x] Exibir aviso de que o resumo e auxiliar.
- [x] Manter link do PDF original em destaque.
- [x] Exibir `resumo_cidadao`.
- [x] Exibir `pontos_principais`.
- [x] Exibir datas relevantes.
- [x] Exibir valores encontrados.
- [x] Exibir partes envolvidas.
- [x] Exibir confianca.
- [x] Mostrar alerta visual quando `confianca < 0.6`.
- [x] Mostrar estado vazio quando `resumo_ai` for `null`.

---

### 4.4 Qualidade e seguranca

- [x] Revisar se o modelo retorna valores e datas sempre com `trecho_fonte` em amostra inicial.
- [ ] Criar amostras de validacao para documentos de tipos diferentes:
  - edital;
  - contrato;
  - decreto;
  - ata;
  - outro.
- [ ] Registrar casos de baixa confianca.
- [ ] Conferir se a IA nao esta extrapolando informacoes.
- [ ] Avaliar limite de custo e uso da NVIDIA.
- [ ] Planejar fallback futuro para Gemini em PDFs longos.

---

## 5. Ordem sugerida dos proximos passos

1. [ ] Rodar lote pequeno real:

```bash
npm run ai:resumir-pendentes -- --limite=5 --max-chars=5000
```

2. [ ] Conferir no banco os documentos resumidos.

3. [ ] Abrir `GET /api/documentos/:id` para alguns documentos com resumo.

4. [x] Revisar manualmente a qualidade dos resumos.

5. [x] Implementar exibicao no frontend somente depois de confirmar qualidade minima.

6. [x] Testar um documento grande para validar chunking.

7. [ ] Atualizar este checklist conforme cada etapa for concluida.

---

## 6. Comandos uteis

### Testar provider configurado

```bash
npm run ai:test
```

### Resumir documento especifico

```bash
npm run ai:resumir -- --documento-id=2
npm run ai:resumir -- --documento-id=2 --dry-run
npm run ai:resumir -- --documento-id=2 --force
```

### Resumir pendentes

```bash
npm run ai:resumir-pendentes -- --limite=5
```

### Subir API

```bash
npm run api
```

### Consultar documento pela API

```text
http://localhost:3001/api/documentos/2
```

---

## 7. Decisoes registradas

- [x] A IA e camada de enriquecimento, nao fonte da verdade.
- [x] Campos oficiais da tabela `documentos` nao sao sobrescritos pela IA.
- [x] O resumo fica em tabela propria.
- [x] O provider inicial e NVIDIA NIM.
- [x] A chave vem de `NVIDIA_API_KEY`.
- [x] O usuario precisa preencher apenas a chave para usar o provider padrao.
- [x] Resposta da IA precisa passar pelo contrato Zod.
- [x] O sistema nao chama a IA novamente se ja existir resumo para o mesmo texto e contrato.
- [x] Frontend fica para depois da validacao do backend e dos scripts.

---

## 8. Registro de erros encontrados

- [x] `git status --short` falhou porque o workspace atual nao esta inicializado como repositorio Git.
- [x] Primeira execucao externa falhou com `Connection error` por restricao de rede do ambiente; passou com permissao externa.
- [x] Execucao paralela do mesmo resumo causou `database is locked` no SQLite; execucao sequencial funcionou.
- [x] Query de pendentes teve erro `Unknown named parameter 'contratoVersao'`; corrigido.
- [x] Primeira validacao HTTP em `3001` bateu em servidor antigo; teste isolado em `3011` confirmou o retorno correto.
- [x] Documento `1` reutilizou resumo `mock` existente por regra de cache; validacao NVIDIA real foi feita no documento `2`.
- [x] Resumos `mock` removidos com `npm run ai:limpar-mock`.
- [x] Lote de 5 documentos com NVIDIA salvou novos resumos, mas a execucao de validacao estourou timeout externo; recomendacao atual e usar lotes menores ou aumentar a janela de execucao.
- [x] Amostra inicial encontrou um caso para revisar: no documento `391`, o valor estruturado nao parece bater perfeitamente com o trecho-fonte.
- [x] Primeiro teste do documento grande `161` falhou porque a IA retornou data fora de `YYYY-MM-DD`; foi criada normalizacao antes do Zod.
- [x] Segundo teste do documento grande `161` falhou porque a IA retornou `papel` fora do enum; foi criada normalizacao de enums controlados.
- [x] Terceiro teste do documento grande `161` encontrou timeout operacional; o fluxo passou a registrar logs por chunk e aceitar `timed out` como erro persistivel.
- [x] A tentativa longa final do documento `161` concluiu e salvou resumo NVIDIA valido no banco.
- [x] Tentativa pela tela no documento `4` gerou timeout por ser um PDF grande; a UI passou a orientar o uso do comando operacional.
- [x] Documento `4` falhou uma vez por itens sem `trecho_fonte`; itens estruturados sem evidencia passaram a ser filtrados antes do Zod.
- [x] Documento `4` foi gerado com sucesso em `4` chunks, com `confianca = 0.8`.

---

## 9. Estado recomendado antes de iniciar frontend

- [x] `npm run ai:test` passa com NVIDIA.
- [x] Pelo menos 1 resumo real salvo com `provider = nvidia`.
- [x] Cache validado com `Reutilizado: sim`.
- [x] API retorna `resumo_ai`.
- [x] Pelo menos 5 resumos reais revisados manualmente.
- [x] Chunking validado com documento grande ou caso controlado.

---

## 10. Proximos passos detalhados

### 10.1 Rodar IA no banco existente

Objetivo: resumir gradualmente os documentos que ja estao no SQLite, sem perder rastreabilidade e sem gastar chamadas desnecessarias.

Checklist operacional:

- [ ] Definir lote padrao inicial.
- [x] Rodar lotes pequenos com documentos curtos primeiro.
- [x] Separar documentos por ano antes de processar em massa.
- [ ] Priorizar anos recentes:
  - [ ] 2026
  - [ ] 2025
  - [ ] 2024
- [ ] Priorizar tipos mais importantes:
  - [ ] editais
  - [ ] contratos
  - [ ] dispensas
  - [ ] inexigibilidades
- [x] Evitar processamento automatico de PDFs grandes ate validar chunking.
- [ ] Processar PDFs grandes apenas em lote pequeno e com timeout maior quando necessario.
- [ ] Registrar quantos documentos foram processados por lote.
- [ ] Registrar quantos falharam por lote.
- [ ] Revisar uma amostra humana a cada lote.

Comando recomendado para a proxima rodada:

```bash
npm run ai:resumir-pendentes -- --dry-run --ano=2026 --tipo=edital --limite=5 --max-chars=20000
```

Depois de conferir a lista:

```bash
npm run ai:resumir-pendentes -- --ano=2026 --tipo=edital --limite=1 --max-chars=20000
```

Motivo: o modelo atual levou perto de 1 minuto por documento curto. Lotes maiores funcionam, mas devem ser rodados com janela maior de execucao.

Depois de estabilizar:

```bash
npm run ai:resumir-pendentes -- --ano=2026 --tipo=edital --limite=5 --max-chars=20000
```

Status atual de `2026 + edital` apos remocao dos mocks:

```text
total=24 | ok=2 | erro=0 | pendentes=22
```

---

### 10.2 Garantir autenticidade e auditabilidade

Objetivo: deixar claro para o usuario e para o sistema que o resumo e derivado do documento original.

Ja implementado:

- [x] resumo salvo em tabela propria;
- [x] campos oficiais de `documentos` nao sao sobrescritos;
- [x] `provider`, `modelo` e `contrato_versao` salvos;
- [x] `texto_hash` salvo;
- [x] API retorna `texto_hash` junto do resumo;
- [x] frontend mostra aviso para conferir o PDF original;
- [x] frontend mantem links para fonte original e PDF.

Ainda precisa:

- [ ] Exibir data/hora completa da geracao do resumo.
- [x] Exibir hash completo em uma area tecnica recolhida.
- [x] Criar indicador visual quando o resumo estiver desatualizado em relacao ao texto atual.
- [x] Criar consulta administrativa para listar resumos por ano/tipo/status.
- [x] Criar pagina administrativa inicial para status dos resumos no frontend.
- [x] Expandir pagina administrativa para provider/modelo/status.
- [ ] Expandir pagina administrativa para contrato.
- [ ] Criar rotina para detectar documentos com `texto_completo` alterado depois do resumo.
- [ ] Revisar casos em que a IA retornou `confianca = 1` para documentos muito curtos.

Regra de produto:

```text
O PDF original e sempre a fonte primaria.
O resumo de IA e somente uma camada auxiliar de leitura.
```

---

### 10.3 Avaliar modelo NVIDIA

Modelo atual:

```env
NVIDIA_MODEL=meta/llama-3.1-70b-instruct
```

Pontos observados:

- [x] Conectividade validada.
- [x] JSON valido validado com Zod.
- [x] Resumos curtos ficaram legiveis.
- [x] Valores e datas vieram com `trecho_fonte` na amostra inicial.
- [ ] Modelo parece lento para lote.
- [ ] Houve um caso de valor possivelmente inconsistente no documento `391`.

Proximos testes:

- [ ] Escolher 3 a 5 documentos de amostra fixa.
- [ ] Rodar com o modelo atual.
- [ ] Trocar `NVIDIA_MODEL` no `.env`.
- [ ] Rodar os mesmos documentos com outro modelo NVIDIA.
- [ ] Comparar:
  - [ ] validade do JSON;
  - [ ] tempo de resposta;
  - [ ] fidelidade dos valores;
  - [ ] fidelidade das datas;
  - [ ] qualidade do `resumo_cidadao`;
  - [ ] se todos os campos sensiveis tem `trecho_fonte`.

Candidatos a avaliar:

- [ ] manter `meta/llama-3.1-70b-instruct`;
- [ ] testar um modelo menor e mais rapido disponivel na NVIDIA;
- [ ] testar um modelo mais novo se estiver disponivel no catalogo da NVIDIA;
- [ ] manter Gemini como fallback futuro para PDFs longos.

Criterio para trocar modelo:

- [ ] reduzir tempo por documento sem piorar fidelidade;
- [ ] reduzir inconsistencias em valores;
- [ ] manter JSON valido de forma consistente;
- [ ] manter bom portugues nos resumos.

---

### 10.4 Botao de gerar ou tentar novamente resumo

Ja implementado:

- [x] endpoint `POST /api/documentos/:id/resumir`;
- [x] botao na pagina de detalhe quando `resumo_ai` ainda nao existe;
- [x] botao chama a API e atualiza a pagina;
- [x] se existir registro anterior com erro para o mesmo hash, o backend tenta gerar novamente em vez de reutilizar o erro.

Ainda precisa:

- [ ] Melhorar mensagem de erro exibida no frontend.
- [ ] Mostrar estado de resumo em processamento se a chamada demorar.
- [x] Avaliar se deve existir botao "Gerar novamente" para resumos ja existentes.
- [x] Se existir "Gerar novamente", exigir confirmacao para evitar custo acidental.
- [ ] Registrar no banco quando uma geracao foi manual.

Implementado nesta fase:

- [x] `POST /api/documentos/:id/resumir` aceita `force=true` por query ou corpo JSON.
- [x] Quando `force=true`, o backend chama `summarizeDocument(..., { force: true })`.
- [x] O frontend mostra "Gerar novamente" quando ja existe resumo.
- [x] Em resumo desatualizado, o botao muda para "Gerar resumo atualizado".
- [x] O retry pede confirmacao antes de chamar a IA para evitar custo acidental.
- [x] O botao de retry usa estilo secundario, deixando a acao menos impulsiva.
- [x] O endpoint retorna erro especifico para o frontend em vez de apenas erro generico.

Arquivos alterados nesta fase:

- `src/api/server.js`
- `frontend/app/components/AiSummaryAction.js`
- `frontend/app/documento/[id]/page.js`
- `ACOMPANHAMENTO_RESUMOS_IA_PDFS.md`

Comandos testados nesta fase:

```bash
node -e "require('./src/api/server').createServer(); console.log('api ok')"
node -e "const { createServer } = require('./src/api/server'); const app = createServer(); const server = app.listen(0, '127.0.0.1', async () => { const port = server.address().port; try { const res = await fetch('http://127.0.0.1:' + port + '/api/documentos/2/resumir', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ force: false }) }); const json = await res.json(); console.log('STATUS=' + res.status); console.log('REUTILIZADO=' + json.reutilizado); console.log('FORCAR=' + json.forcar_regeneracao); console.log('MODELO=' + json.modelo); } finally { server.close(); } });"
npm run build
npm run ai:status -- --ano=2026 --tipo=edital
```

Resultado dos testes:

```text
API carregou sem erro.
POST /api/documentos/2/resumir reutilizou cache existente sem chamar IA.
Build do frontend passou.
Status 2026 edital: total=24 | ok=2 | erro=0 | pendentes=22.
```

Pendencias abertas:

- [ ] Testar manualmente o botao em servidor local chamando IA real.
- [ ] Decidir se geracoes manuais devem ter campo proprio no banco.
- [ ] Registrar historico de regeneracoes, caso seja necessario auditar tentativas.

---

### 10.5 Comparar Prefeitura versus sistema

Objetivo: saber quais arquivos existem no site da Prefeitura e quais ja estao no banco local.

Ja implementado:

- [x] servico `compararCoberturaPrefeitura`;
- [x] endpoint `GET /api/cobertura/prefeitura?limite=N`;
- [x] comparacao por URL do PDF;
- [x] resumo geral com total encontrado, presente e ausente;
- [x] agrupamento por ano;
- [x] pagina `/cobertura`;
- [x] menu "Cobertura" no frontend.

Validado:

- [x] endpoint com `limite=20` retornou:
  - `total_site=20`;
  - `presentes=20`;
  - `ausentes=0`.

Ainda precisa:

- [x] Validar a pagina `/cobertura?limite=20` em servidor local com acesso externo liberado.
- [ ] Criar cache local do resultado de cobertura para nao consultar o site a cada carregamento.
- [ ] Salvar snapshots de cobertura por data.
- [ ] Mostrar diferenca por ano de forma mais detalhada.
- [ ] Permitir filtrar ausentes por ano.
- [ ] Criar acao para coletar novamente um item ausente.

Validacao adicional:

```text
HOME_HAS_COVERAGE_NAV=True
COVERAGE_HAS_TITLE=True
COVERAGE_HAS_SUMMARY=True
```

Observacao:

```text
A primeira retomada falhou por conflito com variavel reservada do PowerShell (`$HOME`), nao por problema no app. A validacao foi repetida com sucesso.
```

---

### 10.6 Separar e organizar registros por ano

Ja implementado:

- [x] API passa a ordenar documentos por `ano` primeiro.
- [x] `GET /api/estatisticas` retorna `por_ano`.
- [x] pagina inicial mostra bloco "Consultar por ano".
- [x] pagina `/documentos` mostra filtros rapidos por ano.
- [x] lista de documentos agrupa resultados por ano.

Ainda precisa:

- [ ] Validar visualmente em mobile.
- [ ] Adicionar paginacao com preservacao do ano filtrado.
- [ ] Melhorar ordenacao dentro do ano por data real de publicacao quando existir.
- [ ] Criar rota amigavel futura:
  - [ ] `/documentos/2026`
  - [ ] `/documentos/2025`
- [ ] Separar tambem por fonte dentro do ano se a lista continuar grande.

---

### 10.7 Melhorar pagina inicial

Problema observado:

```text
A pagina inicial misturava documentos de anos diferentes, dificultando entender o acervo.
```

Ja implementado:

- [x] bloco de consulta por ano;
- [x] atalhos continuam por tipo;
- [x] API ordena documentos por ano;
- [x] pagina de documentos tem agrupamento visual.

Ainda precisa:

- [ ] Revisar se "Publicacoes recentes" deve virar "Ultimos documentos por ano".
- [ ] Exibir 2 ou 3 documentos por ano recente, em vez de uma lista unica.
- [ ] Mostrar status de cobertura por ano na home.
- [ ] Destacar documentos com resumo de IA disponivel.
- [ ] Evitar excesso de informacao na primeira dobra da pagina.

---

### 10.8 Ferramentas de operacao adicionadas

Novos comandos:

```bash
npm run ai:status
npm run ai:status -- --ano=2026 --tipo=edital
npm run ai:resumir-pendentes -- --dry-run --ano=2026 --tipo=edital --limite=5 --max-chars=20000
npm run ai:resumir-pendentes -- --ano=2026 --tipo=edital --limite=1 --max-chars=20000
```

Novos filtros em `ai:resumir-pendentes`:

- [x] `--ano=2026`
- [x] `--tipo=edital`
- [x] `--fonte=site_prefeitura`
- [x] `--min-chars=500`
- [x] `--max-chars=20000`
- [x] `--dry-run`

Melhorias no comando de documento especifico:

- [x] `npm run ai:resumir -- --documento-id=ID --dry-run`
- [x] `npm run ai:resumir -- --documento-id=ID --force`

O `--dry-run` de documento especifico mostra:

- [x] total de caracteres;
- [x] hash atual do texto;
- [x] contrato;
- [x] modo previsto (`direto` ou `chunking`);
- [x] quantidade prevista de chunks;
- [x] cache existente.

Worker de jobs:

- [x] `npm run ai:worker`

Endpoint administrativo:

```text
GET /api/ia/resumos/status
GET /api/ia/resumos/status?ano=2026&tipo=edital
GET /api/ia/health
GET /api/ia/resumos/jobs/:id
```

Pagina administrativa:

```text
/ia
/ia?ano=2026&tipo=edital
```

Validacao feita:

```text
Dry-run 2026 edital ate 20k chars selecionou candidatos corretamente.
Execucao real com limite 1 resumiu o documento 16.
Status 2026 edital confirmado apos limpeza de mocks: ok=2 e pendentes=22.
Build do frontend passou.
Pagina `/ia?ano=2026&tipo=edital` renderizou totais, tabela e comando sugerido.
Pagina `/ia?ano=2026&tipo=edital` renderizou distribuicao por providers/modelos.
Pagina `/documento/2` renderizou compatibilidade do texto atual e detalhes tecnicos do resumo.
Banco local ficou apenas com provider `nvidia`.
`AI_PROVIDER=mock npm run ai:test` falha explicitamente.
```

---

### 10.9 Remocao do mock

Decisao:

```text
Nao manter provider mock no fluxo operacional.
```

Motivos:

- [x] A NVIDIA real ja foi validada.
- [x] Resumos mock confundiam a cobertura na pagina `/ia`.
- [x] Documento com resumo mock parecia processado, mas nao tinha conteudo real.
- [x] O projeto e simples o suficiente para usar teste real controlado com lote pequeno.

O que foi feito:

- [x] Removido `MockProvider` da factory.
- [x] Removido arquivo `src/ai/providers/mock-provider.js`.
- [x] Criado `npm run ai:limpar-mock`.
- [x] Removidos 2 registros mock do banco local.
- [x] `GET /api/documentos/:id` ignora provider `mock` mesmo que exista legado em outro banco.
- [x] Criado `GET /api/ia/health` para confirmar provider/modelo operacional.

Validacao:

```text
providers=[{ provider: "nvidia", total: 9 }]
documento1_tem_resumo=false
AI_PROVIDER=mock -> erro claro
```

---

### 10.10 Validacao real de PDF grande

Objetivo:

```text
Confirmar que documentos acima de AI_MAX_CHARS_DIRECT conseguem ser divididos em chunks, resumidos parcialmente e consolidados em um resumo final valido.
```

Documento testado:

```text
documento_id=161
ano=2023
tipo=edital
caracteres=80048
chunks_previstos=3
tokens_estimados=20012
provider=nvidia
modelo=meta/llama-3.1-70b-instruct
status=ok
confianca=0.8
```

O que foi implementado nesta fase:

- [x] Normalizacao de datas antes da validacao Zod.
- [x] Normalizacao de enums controlados antes da validacao Zod.
- [x] Filtro de itens estruturados sem `trecho_fonte`, preservando apenas dados auditaveis.
- [x] Logs de progresso para processamento em chunks.
- [x] Reconhecimento de `timed out` como erro persistivel.
- [x] `--dry-run` em `npm run ai:resumir`.
- [x] `--force` em `npm run ai:resumir`.
- [x] API retorna `resumo_ai_operacao` com modo previsto, chunks e comando recomendado.
- [x] Frontend evita chamada sincrona para documentos grandes.

Arquivos alterados nesta fase:

- `src/ai/validate-summary.js`
- `src/ai/summarize-document.js`
- `src/api/server.js`
- `src/db/index.js`
- `frontend/app/documento/[id]/page.js`
- `frontend/app/components/AiSummaryAction.js`
- `frontend/app/globals.css`
- `scripts/resumir-documento.js`
- `ACOMPANHAMENTO_RESUMOS_IA_PDFS.md`

Comandos testados nesta fase:

```bash
npm run ai:resumir -- --documento-id=161
npm run ai:resumir -- --documento-id=161 --dry-run
npm run ai:resumir -- --documento-id=4
npm run ai:resumir -- --documento-id=4 --dry-run
npm run ai:resumir -- --documento-id=2 --dry-run
npm run ai:resumir -- --documento-id=2
npm run ai:status
npm run ai:status -- --ano=2026 --tipo=edital
npm run build
```

Resultado:

```text
Documento 161 salvo com status ok.
Documento 4 salvo com status ok.
Resumo geral passou para total=448 | ok=11 | erro=0 | pendentes=437.
Status 2026 edital passou para total=24 | ok=3 | erro=0 | pendentes=21.
Build do frontend passou.
```

Pendencias:

- [ ] Revisar manualmente o resumo do documento `161` contra o PDF original.
- [ ] Definir timeout recomendado para PDFs grandes.
- [ ] Rodar no maximo 1 a 3 PDFs grandes por lote ate termos mais confianca operacional.

---

### 10.11 Fila assincrona de resumos IA

Decisao:

```text
Resumos de documentos grandes nao devem depender de uma requisicao HTTP longa aberta no navegador.
```

O que foi implementado:

- [x] Criada tabela `documentos_resumos_ai_jobs`.
- [x] Jobs salvam `documento_id`, `provider`, `modelo`, `contrato_versao`, `texto_hash`, `status`, `force`, `erro`, `tentativas` e timestamps.
- [x] `POST /api/documentos/:id/resumir` retorna `202` quando cria um job.
- [x] Se ja existir resumo valido para o mesmo hash e contrato, o endpoint continua retornando cache sem criar job.
- [x] Criado `GET /api/ia/resumos/jobs/:id`.
- [x] Criado worker em background chamado pela API apos enfileirar job.
- [x] Criado comando manual `npm run ai:worker`.
- [x] Pagina de documento entende job `pendente`, `processando` e `erro`.
- [x] Botao do frontend acompanha o job ate `ok` ou `erro`.
- [x] Criado `GET /api/ia/resumos/jobs` para listar jobs recentes.
- [x] Criada recuperacao de jobs presos em `processando`.
- [x] Worker recupera jobs presos antes de processar pendentes.
- [x] Pagina `/ia` mostra fila de jobs, status, tentativas, documento e erros.

Arquivos alterados nesta fase:

- `src/db/schema.sql`
- `src/db/index.js`
- `src/api/server.js`
- `src/ai/summary-job-worker.js`
- `scripts/ai-worker.js`
- `package.json`
- `frontend/app/lib/api.js`
- `frontend/app/ia/page.js`
- `frontend/app/globals.css`
- `frontend/app/components/AiSummaryAction.js`
- `frontend/app/documento/[id]/page.js`
- `ACOMPANHAMENTO_RESUMOS_IA_PDFS.md`

Comandos testados nesta fase:

```bash
npm run setup-db
node -e "require('./src/api/server').createServer(); console.log('api ok')"
npm run ai:worker
npm run build
npm run ai:status -- --ano=2026 --tipo=edital
node -e "const { recoverStaleResumoAiJobs } = require('./src/db'); console.log(JSON.stringify(recoverStaleResumoAiJobs({ staleMinutes: 1 }), null, 2));"
```

Validacoes de API:

```text
GET /api/documentos/4 -> modo=chunking, chunks=4, resumo=true.
POST /api/documentos/4/resumir -> status=200, reutilizado=true, sem criar job.
GET /api/ia/resumos/jobs?limite=5 -> status=200.
GET /api/ia/resumos/jobs/999999999 -> status=404.
```

Teste ponta a ponta com documento grande sem cache:

```text
documento_id=471
ano=2018
tipo=edital
caracteres=80465
chunks=3
POST /api/documentos/471/resumir -> 202
job_id=1
fluxo observado=pendente -> processando -> ok
tentativas=1
resumo_ai_id=14
duracao aproximada=3min39s
```

Resultado apos o teste:

```text
GET /api/ia/resumos/jobs?limite=5 -> stats=[{ status: "ok", total: 1 }]
npm run ai:status -> total=448 | ok=12 | erro=0 | pendentes=436
ano=2018 | tipo=edital | total=38 | ok=1 | erro=0 | pendentes=37
npm run build -> passou
```

Pendencias:

- [x] Testar ponta a ponta com um documento grande ainda sem cache.
- [x] Mostrar jobs recentes na pagina `/ia`.
- [x] Definir politica inicial para jobs presos em `processando` se a API cair no meio.
- [ ] Avaliar separar worker em processo proprio em producao.
