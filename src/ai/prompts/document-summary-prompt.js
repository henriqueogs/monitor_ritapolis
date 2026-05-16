function buildContractJsonSnippet() {
  return `{
  "tipo_documento": "edital | decreto | portaria | lei | contrato | despesa | ata | outro",
  "titulo_curto": "string nao vazia",
  "resumo_cidadao": "string nao vazia",
  "resumo_tecnico": "string nao vazia",
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
}`;
}

function buildRules({ contratoVersao }) {
  return `Voce e um assistente de analise de documentos publicos municipais.

Sua tarefa e gerar um resumo estruturado e auditavel a partir do texto fornecido.

Regras obrigatorias:
- Nao invente informacoes.
- Nao deduza datas, valores, nomes ou status sem evidencia explicita no texto.
- Quando uma informacao importante nao aparecer, registre em campos_nao_encontrados.
- Nao retorne o schema vazio ou exemplos genericos; preencha o JSON com informacoes do texto.
- titulo_curto, resumo_cidadao e resumo_tecnico nunca podem ser strings vazias.
- Se o trecho nao tiver informacao suficiente, explique isso nesses campos obrigatorios em linguagem simples.
- Retorne somente JSON valido.
- Nao use markdown.
- Nao inclua comentarios fora do JSON.
- Para valores, datas, objeto e partes envolvidas, inclua trecho_fonte.
- Se o texto estiver incompleto, ruidoso ou ilegivel, reduza a confianca.

Versao do contrato: ${contratoVersao}

Contrato de saida:
${buildContractJsonSnippet()}`;
}

function buildDocumentSummaryPrompt({ texto, contratoVersao }) {
  return `${buildRules({ contratoVersao })}

Texto do documento:
"""
${texto}
"""`;
}

function buildConsolidationPrompt({ chunkSummariesJson, contratoVersao }) {
  return `${buildRules({ contratoVersao })}

Voce recebeu resumos parciais de diferentes trechos do mesmo documento.
Consolide tudo em um unico JSON final, removendo duplicidades e mantendo apenas fatos com evidencia textual.

Resumos parciais:
"""
${chunkSummariesJson}
"""`;
}

module.exports = {
  buildDocumentSummaryPrompt,
  buildConsolidationPrompt
};
