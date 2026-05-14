# Implementação da Etapa de Resumo de PDFs com IA

## Monitor Ritápolis

Este documento define o processo de implementação de uma camada de enriquecimento por IA para gerar resumos estruturados de PDFs coletados pelo Monitor Ritápolis.

A implementação deve preservar a premissa central do projeto: **a IA não é fonte da verdade**. Ela deve apenas organizar, resumir e destacar informações presentes no texto extraído dos documentos originais.

---

## 1. Objetivo da etapa

Adicionar ao projeto uma camada capaz de:

1. identificar documentos com PDF e texto extraído;
2. gerar resumo estruturado do conteúdo;
3. retornar o resumo em JSON padronizado;
4. salvar o resultado no banco com rastreabilidade;
5. reaproveitar resumos já gerados quando o documento não mudou;
6. permitir troca de provedor de IA apenas por configuração no `.env`;
7. exigir do usuário apenas a criação da chave da API e sua inclusão no `.env`.

---

## 2. Decisão arquitetural

A IA deve ser tratada como **camada de enriquecimento**, não como parser oficial.

O dado original continua sendo:

- PDF original;
- `url_origem`;
- `url_pdf`;
- `texto_completo` extraído;
- `hash_conteudo`;
- campos extraídos por parsers determinísticos quando disponíveis.

A IA gera apenas:

- resumo cidadão;
- resumo técnico;
- pontos principais;
- datas relevantes encontradas;
- valores encontrados;
- objeto do documento;
- partes envolvidas;
- alertas de baixa confiança;
- lista de campos não encontrados.

Nenhum dado gerado por IA deve sobrescrever diretamente campos oficiais da tabela `documentos` sem validação posterior.

---

## 3. Provedor recomendado

### 3.1 NVIDIA NIM como primeira opção para o MVP

Para o volume atual do Monitor Ritápolis, faz sentido testar primeiro a **NVIDIA NIM API**, porque:

- oferece APIs serverless para desenvolvimento;
- possui endpoint compatível com OpenAI;
- permite trocar de modelo sem mudar muito o código;
- o volume do projeto tende a ser pequeno ou moderado;
- o custo inicial pode ser zero para prototipação;
- a integração é simples usando `baseURL` e API key.

Documentação relevante:

- NVIDIA NIM LLM API Reference: https://docs.nvidia.com/nim/large-language-models/latest/api-reference.html
- NVIDIA Build API Keys: https://build.nvidia.com/settings/api-keys
- NVIDIA NIM Developers: https://developer.nvidia.com/nim
- Endpoint compatível com OpenAI geralmente usado: `https://integrate.api.nvidia.com/v1`

### 3.2 Risco da NVIDIA

A NVIDIA é uma boa opção para MVP, mas há riscos:

- limites gratuitos podem mudar;
- modelos disponíveis podem mudar;
- pode haver limite por minuto, crédito ou conta;
- alguns modelos podem ter contexto menor do que o Gemini;
- o uso gratuito deve ser tratado como ambiente de desenvolvimento, não garantia de produção.

Por isso, a implementação deve nascer com uma interface de provider intercambiável.

### 3.3 Gemini como fallback para PDFs maiores

O Gemini deve ser mantido como fallback porque costuma ser melhor quando o problema é janela de contexto longa.

Uso sugerido:

- NVIDIA NIM: primeira opção para documentos pequenos e médios;
- Gemini: fallback para documentos muito longos;
- Groq: fallback opcional para velocidade em resumos menores.

---

## 4. Variáveis de ambiente

Adicionar ao `.env.example`:

```env
# IA - Resumo de PDFs
AI_SUMMARY_ENABLED=true
AI_PROVIDER=nvidia
AI_CONTRACT_VERSION=1.0

# NVIDIA NIM
NVIDIA_API_KEY=nvapi-sua-chave-aqui
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
NVIDIA_MODEL=meta/llama-3.1-70b-instruct

# Gemini fallback opcional
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.0-flash

# Groq fallback opcional
GROQ_API_KEY=
GROQ_MODEL=llama-3.1-70b-versatile

# Limites de processamento
AI_MAX_CHARS_DIRECT=80000
AI_CHUNK_SIZE_CHARS=30000
AI_CHUNK_OVERLAP_CHARS=2000
AI_MAX_CHUNKS_PER_DOCUMENT=30
AI_REQUEST_TIMEOUT_MS=60000
AI_RETRY_MAX=2
AI_SAVE_RAW_RESPONSE=false
```

No MVP, o usuário deve precisar preencher apenas:

```env
AI_SUMMARY_ENABLED=true
AI_PROVIDER=nvidia
NVIDIA_API_KEY=nvapi-sua-chave-aqui
```

Os demais valores devem ter defaults seguros no código.

---

## 5. Como obter a chave da NVIDIA

Criar uma seção no `README.md` com este passo a passo:

1. acessar `https://build.nvidia.com`;
2. fazer login ou criar conta NVIDIA Developer;
3. acessar `https://build.nvidia.com/settings/api-keys`;
4. criar uma nova API key;
5. copiar a chave;
6. adicionar no `.env`:

```env
AI_PROVIDER=nvidia
NVIDIA_API_KEY=nvapi-sua-chave-aqui
```

7. rodar o script de teste:

```bash
npm run ai:test
```

8. se o teste passar, rodar o resumo em um documento:

```bash
npm run ai:resumir -- --documento-id=1
```

---

## 6. Dependências sugeridas

Instalar:

```bash
npm install openai zod p-limit
```

Motivo:

- `openai`: cliente compatível com endpoints OpenAI-like, incluindo NVIDIA NIM;
- `zod`: validação do contrato JSON;
- `p-limit`: controle de concorrência para não estourar limite de API.

---

## 7. Estrutura de arquivos sugerida

```text
src/
  ai/
    contracts/
      summary-contract.js
    providers/
      base-provider.js
      nvidia-provider.js
      gemini-provider.js
      groq-provider.js
      mock-provider.js
    prompts/
      document-summary-prompt.js
    chunk-text.js
    estimate-tokens.js
    summarize-document.js
    summarize-pending-documents.js
    validate-summary.js

scripts/
  ai-test.js
  resumir-documento.js
  resumir-pendentes.js
```

---

## 8. Banco de dados

Adicionar uma tabela específica para os resumos de IA.

```sql
CREATE TABLE IF NOT EXISTS documentos_resumos_ai (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  documento_id INTEGER NOT NULL REFERENCES documentos(id),
  provider TEXT NOT NULL,
  modelo TEXT NOT NULL,
  contrato_versao TEXT NOT NULL,
  resumo_json TEXT NOT NULL,
  texto_hash TEXT NOT NULL,
  tokens_estimados INTEGER,
  status TEXT DEFAULT 'ok',
  erro TEXT,
  criado_em TEXT DEFAULT (datetime('now')),
  atualizado_em TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_resumos_ai_documento_id
  ON documentos_resumos_ai(documento_id);

CREATE INDEX IF NOT EXISTS idx_resumos_ai_texto_hash
  ON documentos_resumos_ai(texto_hash);
```

Regra:

- se `texto_hash` atual for igual ao último resumo salvo, não chamar a IA novamente;
- se o texto mudou, gerar novo resumo;
- não apagar resumos antigos inicialmente.

---

## 9. Contrato JSON do resumo

A IA deve retornar somente JSON válido no formato abaixo.

```json
{
  "tipo_documento": "edital | decreto | portaria | lei | contrato | despesa | ata | outro",
  "titulo_curto": "string",
  "resumo_cidadao": "string",
  "resumo_tecnico": "string",
  "pontos_principais": ["string"],
  "datas_relevantes": [
    {
      "tipo": "publicacao | abertura | vigencia | homologacao | assinatura | outro",
      "data": "YYYY-MM-DD | null",
      "descricao": "string",
      "trecho_fonte": "string"
    }
  ],
  "valores": [
    {
      "tipo": "estimado | final | global | mensal | unitario | outro",
      "valor": 0,
      "moeda": "BRL",
      "descricao": "string",
      "trecho_fonte": "string"
    }
  ],
  "partes_envolvidas": [
    {
      "nome": "string",
      "papel": "contratante | contratado | autoridade | fornecedor | orgao_publico | outro",
      "documento": "string | null",
      "trecho_fonte": "string"
    }
  ],
  "objeto": {
    "descricao": "string | null",
    "trecho_fonte": "string | null"
  },
  "riscos_ou_alertas": [
    {
      "nivel": "baixo | medio | alto",
      "descricao": "string",
      "motivo": "string"
    }
  ],
  "campos_nao_encontrados": ["string"],
  "confianca": 0.0
}
```

Regras obrigatórias:

- `confianca` deve variar entre `0` e `1`;
- `resumo_cidadao` deve ser compreensível para pessoa leiga;
- `resumo_tecnico` pode usar linguagem administrativa;
- valores, datas, objeto e partes envolvidas devem conter `trecho_fonte`;
- se não houver evidência textual, o campo deve ficar nulo ou entrar em `campos_nao_encontrados`.

---

## 10. Prompt base

Criar `src/ai/prompts/document-summary-prompt.js`.

```js
function buildDocumentSummaryPrompt({ texto, contratoVersao }) {
  return `
Você é um assistente de análise de documentos públicos municipais.

Sua tarefa é ler o texto extraído de um documento público e gerar um resumo estruturado.

Regras obrigatórias:
- Não invente informações.
- Não deduza datas, valores, nomes ou status sem evidência explícita no texto.
- Quando uma informação importante não aparecer, registre em campos_nao_encontrados.
- Retorne somente JSON válido.
- Não use markdown.
- Não inclua comentários fora do JSON.
- Para valores, datas, objeto e partes envolvidas, inclua trecho_fonte.
- Se o texto estiver incompleto, ruidoso ou ilegível, reduza a confiança.

Versão do contrato: ${contratoVersao}

Contrato de saída:
{
  "tipo_documento": "edital | decreto | portaria | lei | contrato | despesa | ata | outro",
  "titulo_curto": "string",
  "resumo_cidadao": "string",
  "resumo_tecnico": "string",
  "pontos_principais": ["string"],
  "datas_relevantes": [
    {
      "tipo": "publicacao | abertura | vigencia | homologacao | assinatura | outro",
      "data": "YYYY-MM-DD | null",
      "descricao": "string",
      "trecho_fonte": "string"
    }
  ],
  "valores": [
    {
      "tipo": "estimado | final | global | mensal | unitario | outro",
      "valor": 0,
      "moeda": "BRL",
      "descricao": "string",
      "trecho_fonte": "string"
    }
  ],
  "partes_envolvidas": [
    {
      "nome": "string",
      "papel": "contratante | contratado | autoridade | fornecedor | orgao_publico | outro",
      "documento": "string | null",
      "trecho_fonte": "string"
    }
  ],
  "objeto": {
    "descricao": "string | null",
    "trecho_fonte": "string | null"
  },
  "riscos_ou_alertas": [
    {
      "nivel": "baixo | medio | alto",
      "descricao": "string",
      "motivo": "string"
    }
  ],
  "campos_nao_encontrados": ["string"],
  "confianca": 0.0
}

Texto do documento:
"""
${texto}
"""
`;
}

module.exports = { buildDocumentSummaryPrompt };
```

---

## 11. Provider NVIDIA

Criar `src/ai/providers/nvidia-provider.js`.

```js
const OpenAI = require('openai');

class NvidiaProvider {
  constructor(config) {
    this.provider = 'nvidia';
    this.model = config.model;
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL || 'https://integrate.api.nvidia.com/v1',
    });
  }

  async generateJson({ prompt, temperature = 0.1 }) {
    const response = await this.client.chat.completions.create({
      model: this.model,
      temperature,
      messages: [
        {
          role: 'system',
          content: 'Você retorna somente JSON válido, sem markdown e sem texto adicional.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    return response.choices?.[0]?.message?.content || '';
  }
}

module.exports = { NvidiaProvider };
```

Observação:

- manter `temperature` baixa;
- não usar IA criativa para esse caso;
- se o modelo escolhido não obedecer JSON bem, trocar o modelo no `.env` antes de alterar o código.

---

## 12. Factory de provider

Criar `src/ai/providers/index.js`.

```js
const { NvidiaProvider } = require('./nvidia-provider');
const { MockProvider } = require('./mock-provider');

function createAiProvider(env = process.env) {
  const provider = env.AI_PROVIDER || 'nvidia';

  if (provider === 'nvidia') {
    if (!env.NVIDIA_API_KEY) {
      throw new Error('NVIDIA_API_KEY não configurada no .env');
    }

    return new NvidiaProvider({
      apiKey: env.NVIDIA_API_KEY,
      baseURL: env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1',
      model: env.NVIDIA_MODEL || 'meta/llama-3.1-70b-instruct',
    });
  }

  if (provider === 'mock') {
    return new MockProvider();
  }

  throw new Error(`AI_PROVIDER não suportado: ${provider}`);
}

module.exports = { createAiProvider };
```

---

## 13. Validação com Zod

Criar `src/ai/contracts/summary-contract.js`.

```js
const { z } = require('zod');

const SummaryContract = z.object({
  tipo_documento: z.string(),
  titulo_curto: z.string(),
  resumo_cidadao: z.string(),
  resumo_tecnico: z.string(),
  pontos_principais: z.array(z.string()).default([]),
  datas_relevantes: z.array(z.object({
    tipo: z.string(),
    data: z.string().nullable(),
    descricao: z.string(),
    trecho_fonte: z.string(),
  })).default([]),
  valores: z.array(z.object({
    tipo: z.string(),
    valor: z.number().nullable().optional(),
    moeda: z.string().default('BRL'),
    descricao: z.string(),
    trecho_fonte: z.string(),
  })).default([]),
  partes_envolvidas: z.array(z.object({
    nome: z.string(),
    papel: z.string(),
    documento: z.string().nullable().optional(),
    trecho_fonte: z.string(),
  })).default([]),
  objeto: z.object({
    descricao: z.string().nullable(),
    trecho_fonte: z.string().nullable(),
  }),
  riscos_ou_alertas: z.array(z.object({
    nivel: z.string(),
    descricao: z.string(),
    motivo: z.string(),
  })).default([]),
  campos_nao_encontrados: z.array(z.string()).default([]),
  confianca: z.number().min(0).max(1),
});

module.exports = { SummaryContract };
```

---

## 14. Tratamento para PDFs grandes

Criar `src/ai/chunk-text.js`.

Regra inicial:

```text
Se texto <= AI_MAX_CHARS_DIRECT:
  enviar texto completo para IA.

Se texto > AI_MAX_CHARS_DIRECT:
  dividir em chunks de AI_CHUNK_SIZE_CHARS com overlap.
  gerar resumo parcial de cada chunk.
  consolidar os resumos parciais em um resumo final.
```

Parâmetros iniciais recomendados:

```env
AI_MAX_CHARS_DIRECT=80000
AI_CHUNK_SIZE_CHARS=30000
AI_CHUNK_OVERLAP_CHARS=2000
AI_MAX_CHUNKS_PER_DOCUMENT=30
```

Risco:

- chunking pode perder contexto entre seções;
- por isso o overlap é necessário;
- para documentos administrativos, os campos mais importantes costumam aparecer no início e no final;
- em editais longos, anexos podem poluir o resumo.

Melhoria futura:

- identificar seções por títulos como `OBJETO`, `VALOR ESTIMADO`, `PRAZO`, `ABERTURA`, `CONTRATANTE`, `CONTRATADA`;
- priorizar seções relevantes antes de enviar à IA.

---

## 15. Fluxo de `summarizeDocument(documentoId)`

Criar `src/ai/summarize-document.js`.

Fluxo obrigatório:

```text
1. Buscar documento por id.
2. Validar se existe texto_completo.
3. Calcular hash do texto_completo.
4. Verificar se já existe resumo com mesmo documento_id + texto_hash + contrato_versao.
5. Se existir, retornar resumo salvo.
6. Se não existir, montar prompt.
7. Chamar provider configurado.
8. Fazer parse do JSON.
9. Validar com Zod.
10. Salvar em documentos_resumos_ai.
11. Retornar resumo validado.
```

---

## 16. Scripts NPM

Adicionar ao `package.json`:

```json
{
  "scripts": {
    "ai:test": "node scripts/ai-test.js",
    "ai:resumir": "node scripts/resumir-documento.js",
    "ai:resumir-pendentes": "node scripts/resumir-pendentes.js"
  }
}
```

---

## 17. Script de teste da API

Criar `scripts/ai-test.js`.

Objetivo:

- validar `.env`;
- chamar o provider;
- verificar se retorna JSON simples;
- falhar com mensagem clara se a chave estiver errada.

Comando:

```bash
npm run ai:test
```

Resultado esperado:

```text
IA configurada com sucesso.
Provider: nvidia
Modelo: meta/llama-3.1-70b-instruct
JSON de teste validado.
```

---

## 18. Script para resumir um documento específico

Criar `scripts/resumir-documento.js`.

Uso:

```bash
npm run ai:resumir -- --documento-id=1
```

Comportamento:

- buscar o documento `1`;
- gerar ou reutilizar resumo;
- imprimir no terminal:
  - título;
  - provider;
  - modelo;
  - confiança;
  - resumo cidadão.

---

## 19. Script para resumir pendentes

Criar `scripts/resumir-pendentes.js`.

Uso:

```bash
npm run ai:resumir-pendentes -- --limite=20
```

Regras:

- processar apenas documentos com `texto_completo` preenchido;
- ignorar documentos já resumidos com mesmo hash;
- limitar concorrência inicialmente em `1` ou `2`;
- registrar erros sem interromper todo o lote.

---

## 20. API

Atualizar `GET /api/documentos/:id` para incluir o último resumo de IA quando existir.

Formato sugerido:

```json
{
  "id": 1,
  "titulo": "Edital ...",
  "texto_completo": "...",
  "resumo_ai": {
    "provider": "nvidia",
    "modelo": "meta/llama-3.1-70b-instruct",
    "contrato_versao": "1.0",
    "criado_em": "2026-05-12 10:00:00",
    "dados": {
      "resumo_cidadao": "...",
      "resumo_tecnico": "...",
      "confianca": 0.82
    }
  }
}
```

Opcionalmente adicionar endpoint:

```text
POST /api/documentos/:id/resumir
```

Mas para o MVP, é mais seguro gerar por script e apenas exibir pela API.

---

## 21. Frontend

Na página de detalhe do documento, adicionar bloco:

```text
Resumo gerado por IA

[aviso]
Este resumo foi gerado automaticamente a partir do texto extraído do PDF.
Confira sempre o documento original antes de tomar decisão.

Resumo para o cidadão:
...

Pontos principais:
- ...
- ...

Datas e valores encontrados:
...

Confiança: 82%
```

Regras de UX:

- nunca esconder o link do PDF original;
- mostrar aviso de que o resumo é auxiliar;
- se `confianca < 0.6`, mostrar alerta visual;
- se não houver resumo, mostrar estado vazio sem quebrar a tela.

---

## 22. Ordem de implementação

### Fase 1 — Preparação

1. atualizar `.env.example`;
2. criar migration da tabela `documentos_resumos_ai`;
3. instalar dependências;
4. criar estrutura `src/ai`;
5. criar provider mock.

Critério de aceite:

- projeto sobe sem chave real;
- testes com provider mock funcionam.

### Fase 2 — NVIDIA NIM

1. criar `nvidia-provider.js`;
2. criar factory de provider;
3. criar `scripts/ai-test.js`;
4. validar chamada real com `NVIDIA_API_KEY`.

Critério de aceite:

- `npm run ai:test` retorna JSON válido usando NVIDIA.

### Fase 3 — Contrato e validação

1. criar Zod schema;
2. criar prompt base;
3. criar parser seguro de JSON;
4. tratar resposta com markdown acidental, se houver;
5. validar erro com mensagem clara.

Critério de aceite:

- resposta fora do contrato não é salva no banco.

### Fase 4 — Resumo de documento

1. criar `summarizeDocument(documentoId)`;
2. calcular hash do texto;
3. evitar reprocessamento;
4. salvar resumo;
5. criar script `resumir-documento.js`.

Critério de aceite:

- um documento real é resumido e salvo em `documentos_resumos_ai`.

### Fase 5 — PDFs grandes

1. criar chunking;
2. gerar resumos parciais;
3. consolidar resumo final;
4. limitar quantidade de chunks;
5. salvar erro se exceder limite.

Critério de aceite:

- documento grande não quebra o processo;
- documento muito grande é processado em partes ou rejeitado com erro controlado.

### Fase 6 — Lote de pendentes

1. criar `resumir-pendentes.js`;
2. buscar documentos sem resumo atualizado;
3. processar com concorrência baixa;
4. registrar erros;
5. imprimir resumo da execução.

Critério de aceite:

- lote processa N documentos sem duplicar resumo.

### Fase 7 — API e frontend

1. incluir último resumo em `GET /api/documentos/:id`;
2. adicionar bloco de resumo no frontend;
3. exibir confiança;
4. exibir aviso de validação humana;
5. manter link para fonte primária.

Critério de aceite:

- usuário visualiza resumo estruturado sem perder acesso ao PDF original.

---

## 23. Critérios de pronto

A etapa estará pronta quando:

- `.env.example` documentar a chave da NVIDIA;
- `npm run ai:test` funcionar;
- `npm run ai:resumir -- --documento-id=ID` gerar resumo real;
- resumo for salvo com provider, modelo, versão de contrato e hash;
- reexecução não chamar IA se o texto não mudou;
- API retornar o resumo no detalhe do documento;
- frontend mostrar resumo com aviso de que é conteúdo auxiliar;
- erros de IA não quebrarem coleta, API ou frontend.

---

## 24. Riscos e controles

### Risco: alucinação

Controle:

- exigir `trecho_fonte`;
- validar contrato;
- mostrar resumo como auxiliar;
- não sobrescrever campos oficiais.

### Risco: limite gratuito acabar

Controle:

- cache por hash;
- scripts manuais;
- concorrência baixa;
- provider intercambiável.

### Risco: JSON inválido

Controle:

- prompt rígido;
- temperatura baixa;
- tentativa de reparo simples;
- validação com Zod;
- não salvar resposta inválida.

### Risco: PDF muito grande

Controle:

- chunking;
- limite de chunks;
- resumo intermediário;
- erro controlado.

### Risco: custo futuro

Controle:

- não resumir automaticamente todos os documentos sem necessidade;
- priorizar documentos recentes;
- priorizar licitações;
- permitir execução por lote com limite.

---

## 25. Recomendação prática

Implementar primeiro com NVIDIA NIM, porque a integração é simples, o volume do projeto é pequeno o suficiente para testar bem e o endpoint compatível com OpenAI reduz retrabalho.

Mas o código não deve ficar acoplado à NVIDIA.

A decisão correta para o MVP é:

```text
Provider padrão: NVIDIA NIM
Fallback futuro: Gemini
Execução: manual por script no início
Persistência: tabela própria
Validação: Zod
Exibição: apenas como resumo auxiliar auditável
```

---

## 26. Prompt para Codex implementar a etapa

```text
Você está trabalhando no projeto Monitor Ritápolis, um monorepo Node.js + SQLite + Express + Next.js que coleta documentos públicos da Prefeitura e Câmara de Ritápolis/MG.

Implemente uma camada de resumo de PDFs com IA seguindo o arquivo IMPLEMENTACAO_RESUMOS_IA_PDFS.md.

Regras principais:
- A IA é camada de enriquecimento, não fonte da verdade.
- Não sobrescreva campos oficiais da tabela documentos.
- Crie a tabela documentos_resumos_ai.
- Use provider intercambiável.
- Implemente primeiro NVIDIA NIM via endpoint OpenAI-compatible.
- A chave deve vir de NVIDIA_API_KEY no .env.
- O usuário deve precisar apenas preencher a chave no .env.
- Valide a resposta da IA com Zod.
- Salve provider, modelo, contrato_versao, resumo_json e texto_hash.
- Não chame a IA novamente se documento_id + texto_hash + contrato_versao já existir.
- Crie scripts:
  - npm run ai:test
  - npm run ai:resumir -- --documento-id=ID
  - npm run ai:resumir-pendentes -- --limite=N
- Atualize o endpoint GET /api/documentos/:id para retornar o último resumo de IA.
- Não quebre os coletores existentes.
- Não faça frontend antes de validar o backend e os scripts.

Implemente em fases pequenas e, ao final de cada fase, atualize este documento com:
- o que foi implementado;
- arquivos alterados;
- comandos testados;
- pendências;
- erros encontrados.
```
---

## 27. Andamento da implementacao

### Fase 1 - Preparacao

- o que foi implementado:
  - dependencias `openai`, `zod` e `p-limit` adicionadas ao backend;
  - variaveis de ambiente de IA adicionadas ao `.env.example`;
  - defaults de configuracao de IA adicionados em `src/config.js`;
  - tabela `documentos_resumos_ai` criada no schema com indices e unicidade por `documento_id + texto_hash + contrato_versao`;
  - estrutura inicial `src/ai/` criada com provider base e provider mock.
- arquivos alterados:
  - `package.json`
  - `package-lock.json`
  - `.env.example`
  - `src/config.js`
  - `src/db/schema.sql`
  - `src/ai/providers/base-provider.js`
  - `src/ai/providers/mock-provider.js`
- comandos testados:
  - `npm install openai zod p-limit`
  - `npm run setup-db`
- pendencias:
  - validar provider NVIDIA real com chave;
  - fechar fluxo completo de resumo e lote.
- erros encontrados:
  - `git status --short` falhou porque o workspace atual nao esta inicializado como repositorio Git.

### Fase 2 - NVIDIA NIM

- o que foi implementado:
  - provider `nvidia` via endpoint OpenAI-compatible;
  - factory de providers com suporte a `nvidia` e `mock`;
  - script `npm run ai:test` criado para validar a integracao.
- arquivos alterados:
  - `src/ai/providers/nvidia-provider.js`
  - `src/ai/providers/index.js`
  - `scripts/ai-test.js`
  - `README.md`
- comandos testados:
  - `$env:AI_PROVIDER='mock'; npm run ai:test`
- pendencias:
  - validar chamada real com `NVIDIA_API_KEY`.
- erros encontrados:
  - nenhum erro novo nesta fase.

### Fase 3 - Contrato e validacao

- o que foi implementado:
  - contrato Zod do resumo estruturado;
  - prompt base do documento e prompt de consolidacao;
  - parser seguro para extrair JSON mesmo com fences acidentais;
  - validacao com mensagens de erro legiveis.
- arquivos alterados:
  - `src/ai/contracts/summary-contract.js`
  - `src/ai/prompts/document-summary-prompt.js`
  - `src/ai/validate-summary.js`
  - `src/ai/estimate-tokens.js`
  - `src/ai/chunk-text.js`
- comandos testados:
  - `node -e "require('./src/ai/summarize-document'); require('./src/ai/summarize-pending-documents'); require('./src/api/server'); console.log('modules-ok')"`
- pendencias:
  - validar respostas reais do provider NVIDIA contra o contrato.
- erros encontrados:
  - nenhum erro novo nesta fase.

### Fase 4 - Resumo de documento

- o que foi implementado:
  - `summarizeDocument(documentoId)` com hash SHA-256 do `texto_completo`, cache por `documento_id + texto_hash + contrato_versao`, validacao e persistencia;
  - salvamento de provider, modelo, contrato, JSON do resumo e hash do texto;
  - script `npm run ai:resumir -- --documento-id=ID`.
- arquivos alterados:
  - `src/ai/summarize-document.js`
  - `src/db/index.js`
  - `scripts/resumir-documento.js`
- comandos testados:
  - `$env:AI_PROVIDER='mock'; npm run ai:resumir -- --documento-id=1`
  - repeticao sequencial do mesmo comando confirmando `Reutilizado: sim`
- pendencias:
  - validar com provider NVIDIA real.
- erros encontrados:
  - uma execucao paralela do mesmo comando gerou `database is locked` no SQLite; a validacao correta passou em sequencia, que e o fluxo manual esperado.

### Fase 5 - PDFs grandes

- o que foi implementado:
  - chunking por caracteres com overlap;
  - consolidacao final a partir de resumos parciais;
  - persistencia controlada de erro para casos como excesso de chunks, timeout ou rate limit.
- arquivos alterados:
  - `src/ai/chunk-text.js`
  - `src/ai/summarize-document.js`
  - `src/ai/prompts/document-summary-prompt.js`
- comandos testados:
  - validacao indireta por carregamento de modulo e fluxo completo com provider mock.
- pendencias:
  - testar documento real que exceda `AI_MAX_CHARS_DIRECT`.
- erros encontrados:
  - nenhum erro novo nesta fase.

### Fase 6 - Lote de pendentes

- o que foi implementado:
  - busca de documentos pendentes sem resumo atualizado;
  - processamento em lote com concorrencia baixa usando `p-limit`;
  - script `npm run ai:resumir-pendentes -- --limite=N`.
- arquivos alterados:
  - `src/ai/summarize-pending-documents.js`
  - `scripts/resumir-pendentes.js`
  - `src/db/index.js`
- comandos testados:
  - `$env:AI_PROVIDER='mock'; npm run ai:resumir-pendentes -- --limite=1`
- pendencias:
  - validar lote real com provider NVIDIA.
- erros encontrados:
  - erro inicial `Unknown named parameter 'contratoVersao'` corrigido ao ajustar a query de documentos pendentes.

### Fase 7 - API

- o que foi implementado:
  - `GET /api/documentos/:id` agora inclui `resumo_ai` com o ultimo resumo valido salvo, em formato com metadados e `dados`.
- arquivos alterados:
  - `src/db/index.js`
- comandos testados:
  - `@' ... '@ | node -` para validar o handler de `/api/documentos/:id` diretamente
  - job PowerShell com `API_PORT=3011` e `Invoke-WebRequest http://127.0.0.1:3011/api/documentos/1`
- pendencias:
  - validar novamente em um ambiente sem outro servidor ocupando a porta `3001`.
- erros encontrados:
  - a primeira validacao HTTP em `3001` bateu em um servidor ja existente e mascarou o resultado; o teste isolado em `3011` confirmou o `resumo_ai` no payload.

### Validacao com NVIDIA real

- o que foi validado:
  - `.env` com `NVIDIA_API_KEY` configurada;
  - chamada real ao provider `nvidia`;
  - resposta JSON validada pelo contrato Zod;
  - resumo real salvo em `documentos_resumos_ai`;
  - reutilizacao do resumo salvo na segunda execucao.
- comandos testados:
  - `npm run ai:test`
  - `npm run ai:resumir -- --documento-id=2`
  - repeticao de `npm run ai:resumir -- --documento-id=2` confirmando `Reutilizado: sim`
- resultado:
  - provider: `nvidia`
  - modelo: `meta/llama-3.1-70b-instruct`
  - documento resumido: `2`
  - status no banco: `ok`
- pendencias:
  - opcionalmente testar um documento grande que use chunking.
- erros encontrados:
  - a primeira execucao de `npm run ai:test` sem permissao externa falhou com `Connection error`; ao permitir acesso de rede, o teste passou.
  - o documento `1` reutilizou resumo `mock` existente por cumprir a regra de cache por `documento_id + texto_hash + contrato_versao`; por isso a validacao real foi feita no documento `2`.
