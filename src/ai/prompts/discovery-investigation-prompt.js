'use strict';

const CAMPOS_AMBIENTAIS = [
  'laudo tecnico',
  'autorizacao/licenca ambiental',
  'compensacao ou replantio',
  'localizacao detalhada',
  'especies',
  'altura ou diametro',
  'justificativa',
  'fotos ou mapas',
  'responsavel tecnico',
];

const CHECKLISTS = {
  'meio_ambiente.supressao_arvores': CAMPOS_AMBIENTAIS,
  supressao_arvores: CAMPOS_AMBIENTAIS,
  'compras.precos_itens': [
    'unidade de medida',
    'quantidade',
    'valor unitario',
    'valor final',
    'fornecedor',
    'fonte do preco',
    'comparativo com itens semelhantes',
  ],
  'contratos.recorrencia_fornecedor_objeto': [
    'fornecedor',
    'CNPJ',
    'valor final',
    'objeto',
    'vigencia',
    'justificativa de recorrencia',
    'documentos do mesmo fornecedor ou objeto',
  ],
  'eventos.gastos_eventos_publicos': [
    'evento',
    'objeto contratado',
    'valor',
    'fornecedor',
    'entregaveis',
    'justificativa',
    'periodo de realizacao',
  ],
};

function resumirEvidencias(evidencias = []) {
  return evidencias.slice(0, 12).map((ev) => ({
    documento_id: ev.documento_id || null,
    anexo_id: ev.anexo_id || null,
    quantidade: ev.metadados?.quantidade ?? null,
    unidade: ev.metadados?.unidade || null,
    valor: ev.metadados?.valor ?? null,
    descricao: ev.metadados?.descricao || null,
    trecho_fonte: String(ev.trecho_fonte || '').slice(0, 700),
  }));
}

function buildDiscoveryInvestigationPrompt({ alerta, lacunasDeterministicas = [], narrativaConsolidadaAtiva = true }) {
  const tipoInvestigacao =
    alerta.metadados?.investigacao_tipo ||
    alerta.metadados?.tipo_fato ||
    alerta.subcategoria ||
    alerta.categoria;
  const checklist = alerta.metadados?.campos_a_verificar || CHECKLISTS[tipoInvestigacao] || [];
  const payload = {
    contrato: 'discovery-investigation-v2',
    tipo: alerta.metadados?.tipo_fato || alerta.subcategoria || alerta.categoria,
    tema: alerta.metadados?.tema || alerta.categoria,
    tipo_investigacao: tipoInvestigacao,
    titulo: alerta.titulo,
    categoria: alerta.categoria,
    subcategoria: alerta.subcategoria,
    periodo: {
      inicio: alerta.periodo_inicio || null,
      fim: alerta.periodo_fim || null,
      label: alerta.valor_periodo_label || null,
    },
    metrica_principal: {
      valor_total: alerta.valor_total ?? null,
      unidade: alerta.metadados?.unidade || null,
      documentos: alerta.documentos_ids?.length || 0,
    },
    janelas: alerta.metadados?.janelas || [],
    metricas: alerta.metadados?.metricas || {},
    comparativos: alerta.metadados?.comparativos || {},
    documentos_relacionados: (alerta.documentos || []).slice(0, 16),
    lacunas_deterministicas: lacunasDeterministicas,
    campos_a_verificar: checklist,
    limites_publicacao: [
      'Nao afirmar irregularidade no texto publico.',
      'Nao dizer que um documento nao existe; diga apenas nao encontrado nos documentos analisados.',
      'Nao publicar numero, valor, data ou fornecedor que nao esteja no JSON de entrada.',
    ],
    evidencias: resumirEvidencias(alerta.evidencias),
  };

  return `
Voce e um analista civico revisando uma descoberta antes de publica-la.
Use somente o JSON abaixo. Nao invente documentos, numeros, datas, valores, fornecedores ou conclusoes.

Objetivo:
- Transformar um candidato factual em uma investigacao cidada cautelosa.
- Publico: tom neutro, sem acusacao, sem afirmar irregularidade.
- Admin: pode ser mais direto sobre fragilidades documentais, risco de baixa transparencia e pontos sensiveis.

Regras obrigatorias:
- Retorne somente JSON valido.
- O campo publico nao pode usar "irregularidade", "fraude", "crime", "corrupcao", "ilegal", "suspeita" ou equivalentes.
- Se um campo a verificar nao aparecer nas evidencias, diga "nao encontrado nos documentos analisados".
- "nao encontrado" nao significa que nao existe; significa apenas que nao apareceu nos trechos/documentos analisados.
- Toda evidencia_usada deve se referir a documento_id/anexo_id existente no JSON de entrada.
- nivel_confianca deve ser numero entre 0 e 1.
- Inclua em limites_publicacao qualquer cuidado que impeça leitura exagerada do caso.
${narrativaConsolidadaAtiva ? `- narrativa_consolidada: paragrafo UNICO (2-4 frases) que e a leitura principal do publico.
  Some/consolide os fatos relevantes (o_que_os_dados_mostram) e a lacuna mais relevante
  (lacunas_encontradas) na MESMA prosa, em vez de listar fatos soltos. Cite os documentos
  entre colchetes quando fizer sentido (ex.: "[607]"). SO calcule razao/proporcao
  (ex.: R$ por unidade) quando os dados numericos permitirem e isso for informativo para
  o tema — NUNCA force esse calculo em temas qualitativos (ex.: saude, recorrencia de
  fornecedor) onde nao faz sentido. o_que_os_dados_mostram e lacunas_encontradas continuam
  obrigatorios (evidencia auditavel), mas narrativa_consolidada e o texto que o publico le.` : ''}

Formato:
{
  "tema": "tema publico",
  "tipo_investigacao": "tipo.estavel",
  "hipotese_publica": "frase cautelosa sobre por que vale olhar",${narrativaConsolidadaAtiva ? `
  "narrativa_consolidada": "paragrafo unico consolidando fatos + lacuna relevante em prosa",` : ''}
  "o_que_os_dados_mostram": ["fato verificavel 1"],
  "lacunas_encontradas": ["nao encontrado nos documentos analisados: ..."],
  "perguntas_abertas": ["pergunta publica em aberto"],
  "evidencias_usadas": [
    {"documento_id": 123, "anexo_id": null, "descricao": "evidencia resumida"}
  ],
  "nivel_confianca": 0.75,
  "analise_admin": "analise mais direta para administracao do sistema",
  "metricas": {},
  "comparativos": {},
  "documentos_relacionados": [{"documento_id": 123, "papel": "evidencia", "observacao": "curta"}],
  "campos_a_verificar": ["campo"],
  "limites_publicacao": ["cuidado publico"]
}

JSON de entrada:
${JSON.stringify(payload, null, 2)}
`.trim();
}

module.exports = {
  CAMPOS_AMBIENTAIS,
  CHECKLISTS,
  buildDiscoveryInvestigationPrompt,
};
