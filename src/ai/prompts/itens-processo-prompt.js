'use strict';

// Prompt de reextração completa dos itens de um processo licitatório, a
// partir do texto do edital + textos das atas/anexos de resultado
// vinculados. Mesmo padrão de POSTURA de anexo-resumo-prompt.js.

// Nemotron-3-Nano aguenta contexto grande (100k+ tokens), mas cap explícito
// evita prompt gigante nos outliers (anexo de 1,3M chars visto no banco) —
// truncamento sempre sinalizado, nunca silencioso (a IA recebe aviso no
// próprio texto e pode registrar em `lacunas`).
const MAX_TEXTO_EDITAL_CHARS = 60000;
const MAX_TEXTO_ATA_CHARS = 60000;
const MAX_ATAS = 5;

function truncar(texto, limite) {
  const t = String(texto || '');
  if (t.length <= limite) {return t;}
  return `${t.slice(0, limite)}\n[...texto truncado em ${limite} caracteres...]`;
}

function buildItensProcessoPrompt({ documento, atas = [] }) {
  const payload = {
    documento: {
      titulo: documento?.titulo || null,
      tipo: documento?.tipo || null,
      ano: documento?.ano || null,
      texto_edital: truncar(documento?.texto_completo, MAX_TEXTO_EDITAL_CHARS),
    },
    atas: atas.slice(0, MAX_ATAS).map((ata) => ({
      nome: ata.nome || null,
      tipo: ata.tipo || null,
      texto: truncar(ata.texto_completo, MAX_TEXTO_ATA_CHARS),
    })),
  };

  return `
Voce e um assistente que le o edital e as atas de um processo de licitacao
publica municipal e extrai, de forma estruturada, os itens solicitados e o
resultado da licitacao (quem venceu e por qual valor).

Use somente o texto fornecido. Nao invente numeros, nomes, datas ou valores
que nao estejam no texto. Cada linha extraida precisa vir acompanhada do
trecho exato de onde foi tirada (trecho_fonte).

ATENCAO — nem todo texto de anexo e uma lista de itens:
Alguns documentos anexados a um processo NAO sao listas de itens licitados —
podem ser cronogramas fisico-financeiros de medicao de obra, planilhas de
pagamento por etapa, ou outras tabelas sem relacao com "o que foi comprado e
por quanto". Se o texto fornecido nao contiver uma tabela reconhecivel de
itens licitados ou resultado de lote/item, defina tem_tabela_itens=false e
explique em lacunas (ex.: "o texto e um cronograma de medicao de obra, nao
uma lista de itens licitados"). NUNCA transforme uma linha de cronograma,
medicao ou planilha financeira em um "item" — e melhor declarar ausencia de
tabela do que inventar um item que nao existe.

Regras obrigatorias:
- POSTURA (obrigatoria): informativo e organizacional, nunca afirmacao de
  verdade absoluta. Atribua a fonte ("segundo o edital", "conforme consta na
  ata"). Nao oriente acoes, nao de conselhos, nao garanta nada.
- itens_solicitados: itens/servicos pedidos no edital (o que a Prefeitura
  quis contratar), com quantidade/unidade/valor estimado quando o texto
  trouxer. Cada item precisa de trecho_fonte.
- resultado_lotes: quando o resultado foi homologado POR LOTE (um
  fornecedor vence um conjunto de itens por um teto/valor unico do lote),
  um item por lote com objeto, fornecedor e teto_homologado. Cada lote
  precisa de trecho_fonte.
- resultado_global: quando o processo tem um UNICO valor final (sem quebra
  por item ou lote) — objeto com fornecedor e valor. null se nao aplicavel.
- Um processo normalmente tem OU resultado_lotes OU resultado_global, nao
  os dois — a menos que o texto realmente mostre ambos os casos.
- lacunas: informacoes esperadas mas ausentes no texto (frases curtas).
- confianca: 0 a 1, refletindo o quanto o texto parece completo, legivel e
  efetivamente uma tabela de itens/resultado de licitacao.
- Retorne somente JSON valido, sem markdown, sem comentarios fora do JSON.

Formato:
{
  "tem_tabela_itens": true,
  "itens_solicitados": [{"item_numero": "1", "descricao": "...", "quantidade": 10, "unidade": "un", "valor_estimado": 1200.5, "trecho_fonte": "..."}],
  "resultado_lotes": [{"lote_numero": "1", "objeto": "...", "fornecedor_nome": "...", "fornecedor_cnpj": null, "teto_homologado": 195000, "trecho_fonte": "..."}],
  "resultado_global": null,
  "lacunas": ["..."],
  "confianca": 0.85
}

JSON de entrada:
${JSON.stringify(payload, null, 2)}
`.trim();
}

module.exports = { buildItensProcessoPrompt, MAX_TEXTO_EDITAL_CHARS, MAX_TEXTO_ATA_CHARS, MAX_ATAS };
