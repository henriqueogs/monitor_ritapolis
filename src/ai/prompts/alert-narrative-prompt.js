'use strict';

// Constrói o prompt para gerar a narrativa de um alerta temático agregado.
// Segue o padrão de `integrated-reading-prompt.js`.
//
// Entrada:
//   { tipo, categoria, ano, documentos: [{id, titulo, data_publicacao, url_origem, valor}],
//     valor_total, valor_periodo_label, periodo_inicio, periodo_fim,
//     questionamentos: [string], sinais: [string], motivos: [string] }
//
// Saída: string de prompt.

function buildAlertNarrativePrompt({
  categoria,
  ano,
  documentos,
  valor_total,
  valor_periodo_label,
  periodo_inicio,
  periodo_fim,
  questionamentos,
  sinais,
  motivos,
}) {
  const docsResumidos = documentos.slice(0, 20).map((d) => ({
    id: d.id,
    titulo: (d.titulo || '').slice(0, 120),
    data_publicacao: d.data_publicacao || null,
    url_origem: d.url_origem || null,
    valor: d.valor || null,
  }));

  const payload = {
    categoria,
    ano,
    periodo: { inicio: periodo_inicio, fim: periodo_fim },
    valor_total,
    valor_periodo_label,
    sinais: sinais || [],
    motivos: motivos || [],
    questionamentos: questionamentos || [],
    documentos: docsResumidos,
    total_documentos: documentos.length,
  };

  return `
Voce e um analista civico. Gere a narrativa de um alerta tematico agregado a partir do JSON estruturado abaixo.

Regras obrigatorias:
- Retorne somente JSON valido, sem markdown e sem texto adicional.
- Nao invente numeros, datas, valores, fornecedores ou documentos.
- Todo numero citado precisa existir no JSON de entrada.
- Quando houver valor_total, sempre cite o ${'`valor_periodo_label`'} ao lado (regra de produto: valores sempre escopados por periodo).
- Escreva em portugues claro para cidadaos, em linguagem acessivel.
- O titulo deve ser curto (maximo 90 caracteres) e informativo.
- A narrativa deve explicar o padrao detectado, citar o periodo e os documentos envolvidos.
- Os questionamentos devem ser perguntas genuinas em aberto, ancoradas nos dados — nunca afirmacoes. Se nao houver lacunas, retorne lista vazia.
- Se houver questionamentos estruturados na entrada, transforme-os em perguntas claras.

Formato esperado:
{
  "titulo": "string curto",
  "narrativa": "string em linguagem natural explicando o padrao",
  "questionamentos": ["pergunta 1", "pergunta 2"]
}

JSON estruturado do alerta:
${JSON.stringify(payload, null, 2)}
`.trim();
}

module.exports = { buildAlertNarrativePrompt };
