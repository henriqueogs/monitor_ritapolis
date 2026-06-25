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
  "itens_licitados": [
    {
      "item_numero": "string | null",
      "lote_numero": "string | null",
      "descricao": "string",
      "unidade": "string | null",
      "quantidade": 0,
      "valor_unitario_estimado": 0,
      "valor_total_estimado": 0,
      "valor_unitario_final": 0,
      "valor_total_final": 0,
      "valor_final_tipo": "unitario | total_item | lote | global | indefinido | null",
      "valor_lote_final": 0,
      "valor_global_final": 0,
      "fornecedor_nome": "string | null",
      "fornecedor_cnpj": "string | null",
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
- POSTURA (obrigatoria): o texto e informativo e organizacional, NUNCA afirmacao de verdade absoluta nem recomendacao. Atribua a fonte ("segundo o documento", "conforme consta no texto"). Nao oriente acoes, nao de conselhos, nao garanta nada, nao use imperativos de decisao nem tom de denuncia/alarme. Dado incerto deve ser apresentado como algo a conferir na fonte oficial.
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
- Em itens_licitados, inclua apenas produtos, servicos, itens ou lotes explicitamente descritos no texto com trecho_fonte.
- Nao crie item licitado apenas a partir do objeto geral do processo; se nao houver item/lote/produto detalhado, retorne itens_licitados vazio.
- Para itens_licitados, use null quando quantidade, unidade, fornecedor ou valores nao aparecerem explicitamente.
- Diferencie valor estimado de valor final somente quando o texto disser isso claramente.
- Em itens_licitados, preencha valor_final_tipo quando houver valor final: unitario para preco por unidade, total_item para total do item, lote para valor do lote, global para valor global do objeto/servico, indefinido quando o texto mostra valor mas nao permite classificar.
- Use valor_lote_final e valor_global_final apenas quando houver evidencia textual explicita de lote ou valor global; nao copie esses valores para valor_unitario_final.
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
