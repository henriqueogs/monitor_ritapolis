'use strict';

const MAX_TEXTO_CHARS = 8000;

// Prompt para resumo de anexo via IA. Mesma regra de POSTURA usada em
// document-summary/integrated-reading/alert-narrative (CLAUDE.md §11).
function buildAnexoResumoPrompt({ anexo, documento, texto }) {
  const payload = {
    anexo: {
      nome: anexo.nome || null,
      tipo: anexo.tipo || null,
    },
    documento: {
      titulo: documento?.titulo || null,
      tipo: documento?.tipo || null,
      ano: documento?.ano || null,
    },
    texto: String(texto || '').slice(0, MAX_TEXTO_CHARS),
  };

  return `
Voce e um assistente que resume um anexo de um processo publico (edital, ata,
contrato, homologacao) para leitura por um cidadao comum.

Use somente o texto fornecido. Nao invente numeros, nomes, datas ou valores
que nao estejam no texto.

Regras obrigatorias:
- POSTURA (obrigatoria): o texto e informativo e organizacional, NUNCA
  afirmacao de verdade absoluta nem recomendacao. Atribua a fonte ("segundo o
  documento", "conforme consta no texto"). Nao oriente acoes, nao de
  conselhos, nao garanta nada, nao use tom de denuncia/alarme.
- resumo_curto: 1-3 frases resumindo o conteudo do anexo (o que ele e, o que
  registra) — nunca vazio, nunca generico ("este e um anexo").
- pontos_relevantes: destaque valores, datas, fornecedores, quantidades ou
  decisoes explicitas no texto (tipo curto + descricao). Vazio se nao houver
  nada relevante alem do resumo. "quantidade" deve ser numero puro (ex: 12400,
  sem separador de milhar, ponto como decimal) — nunca texto formatado.
- lacunas: aponte, em frases curtas, informacoes que um leitor esperaria
  encontrar neste tipo de anexo mas que nao aparecem no texto (ex.:
  "nao ha data de assinatura no texto"). Vazio se nao houver lacuna clara.
- confianca: numero entre 0 e 1 refletindo o quanto o texto extraido parece
  completo e legivel (baixo se o texto parecer truncado, incoerente ou com
  ruido de digitalizacao).
- Retorne somente JSON valido, sem markdown, sem comentarios fora do JSON.

Formato:
{
  "resumo_curto": "...",
  "pontos_relevantes": [{"tipo": "valor", "subtipo": "homologado", "descricao": "...", "quantidade": 1200.5, "unidade": "R$"}],
  "lacunas": ["..."],
  "confianca": 0.8
}

JSON de entrada:
${JSON.stringify(payload, null, 2)}
`.trim();
}

module.exports = { buildAnexoResumoPrompt, MAX_TEXTO_CHARS };
