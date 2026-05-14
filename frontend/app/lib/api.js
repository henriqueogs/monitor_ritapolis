export const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

async function fetchJson(path) {
  let response;

  try {
    response = await fetch(`${apiUrl}${path}`, {
      cache: 'no-store'
    });
  } catch (error) {
    throw new Error(`Falha ao conectar na API ${apiUrl}${path}: ${error.message}`);
  }

  if (!response.ok) {
    let detail = '';

    try {
      const body = await response.json();
      detail = body?.error ? `: ${body.error}` : '';
    } catch {
      detail = '';
    }

    throw new Error(`Falha ao carregar ${path} (${response.status})${detail}`);
  }

  return response.json();
}

function emptyList(params = {}) {
  return {
    total: 0,
    pagina: Number(params.pagina || 1),
    limite: Number(params.limite || 20),
    dados: []
  };
}

function emptyEstatisticas() {
  return {
    total_documentos: 0,
    total_licitacoes: 0,
    publicacoes_recentes: 0,
    valor_estimado_total: 0,
    ultima_coleta: null,
    por_ano: [],
    por_fonte: [],
    por_tipo: [],
    qualidade_por_ano: [],
    qualidade_por_fonte: [],
    qualidade_por_tipo: [],
    qualidade_dados: {
      sem_pdf: 0,
      erro_pdf: 0,
      sem_data: 0
    },
    status_fontes: []
  };
}

async function tryFetchJson(path) {
  try {
    return await fetchJson(path);
  } catch {
    return null;
  }
}

export function buildQuery(params = {}) {
  const search = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  });

  const query = search.toString();
  return query ? `?${query}` : '';
}

export function fetchDocumentos(params = {}) {
  return fetchJson(`/documentos${buildQuery(params)}`);
}

export function fetchDocumento(id) {
  return fetchJson(`/documentos/${id}`);
}

export function fetchLicitacoes(params = {}) {
  return fetchJson(`/licitacoes${buildQuery(params)}`).catch(async () => {
    const fallback = await fetchDocumentos({
      ...params,
      tipo: 'edital'
    }).catch(() => emptyList(params));

    return {
      ...fallback,
      dados: fallback.dados.map((item) => ({
        ...item,
        licitacao_detalhes: item.licitacao_detalhes || {
          modalidade:
            item.dados_extras?.licitacao?.modalidade ||
            item.dados_extras?.campos?.['Modalidade nº'] ||
            item.dados_extras?.campos?.['Modalidade n�'] ||
            null,
          status: null,
          vencedor_nome: null,
          vencedor_cnpj: null,
          valor_final: null,
          numero_pncp: null,
          data_homologacao: null
        }
      }))
    };
  });
}

export function fetchEstatisticas() {
  return fetchJson('/estatisticas').catch(async () => {
    const [documentos, licitacoes, coletas] = await Promise.all([
      fetchDocumentos({ limite: 1 }).catch(() => emptyList({ limite: 1 })),
      fetchDocumentos({ tipo: 'edital', limite: 1 }).catch(() => emptyList({ limite: 1 })),
      tryFetchJson('/coletas/log?limite=10')
    ]);

    const logs = coletas?.dados || [];
    const statusMap = new Map();

    logs.forEach((item) => {
      if (!statusMap.has(item.fonte)) {
        statusMap.set(item.fonte, item);
      }
    });

    return {
      total_documentos: documentos.total || 0,
      total_licitacoes: licitacoes.total || 0,
      publicacoes_recentes: 0,
      valor_estimado_total: 0,
      ultima_coleta: logs[0]
        ? {
            fonte: logs[0].fonte,
            fim: logs[0].fim,
            status: logs[0].status
          }
        : null,
      por_fonte: [],
      por_ano: [],
      por_tipo: [],
      qualidade_por_ano: [],
      qualidade_por_fonte: [],
      qualidade_por_tipo: [],
      qualidade_dados: {
        sem_pdf: 0,
        erro_pdf: 0,
        sem_data: 0
      },
      status_fontes: Array.from(statusMap.values()).map((item) => ({
        fonte: item.fonte,
        status: item.status,
        fim: item.fim,
        itens_novos: item.itens_novos,
        itens_atualizados: item.itens_atualizados,
        itens_com_erro: item.itens_com_erro
      }))
    };
  });
}

export function fetchPainelCidadao() {
  return fetchJson('/painel-cidadao').catch(async () => {
    const [estatisticas, recentes, licitacoes, coletas] = await Promise.all([
      fetchEstatisticas().catch(() => emptyEstatisticas()),
      fetchDocumentos({ limite: 6 }).catch(() => emptyList({ limite: 6 })),
      fetchLicitacoes({ limite: 5 }).catch(() => emptyList({ limite: 5 })),
      fetchColetas({ limite: 5 }).catch(() => ({ dados: [] }))
    ]);

    return {
      resumo: {
        total_documentos: estatisticas.total_documentos,
        total_licitacoes: estatisticas.total_licitacoes,
        publicacoes_recentes: estatisticas.publicacoes_recentes,
        valor_estimado_total: estatisticas.valor_estimado_total,
        ultima_coleta: estatisticas.ultima_coleta
      },
      publicacoes_recentes: recentes.dados,
      licitacoes_recentes: licitacoes.dados,
      anos: estatisticas.por_ano || [],
      fontes: estatisticas.por_fonte || [],
      qualidade_por_ano: estatisticas.qualidade_por_ano || [],
      qualidade_por_fonte: estatisticas.qualidade_por_fonte || [],
      qualidade_por_tipo: estatisticas.qualidade_por_tipo || [],
      ultimas_coletas: coletas.dados || [],
      alertas_qualidade: [
        {
          tipo: 'sem_pdf',
          titulo: 'Documentos sem PDF',
          total: estatisticas.qualidade_dados?.sem_pdf || 0,
          descricao: 'Registros com fonte oficial, mas sem arquivo PDF vinculado.'
        },
        {
          tipo: 'erro_pdf',
          titulo: 'PDFs com falha de leitura',
          total: estatisticas.qualidade_dados?.erro_pdf || 0,
          descricao: 'Documentos encontrados em que o texto do PDF nao foi extraido corretamente.'
        },
        {
          tipo: 'sem_data',
          titulo: 'Registros sem data',
          total: estatisticas.qualidade_dados?.sem_data || 0,
          descricao: 'Itens em que a data de publicacao nao foi identificada.'
        }
      ]
    };
  });
}

export function fetchColetas(params = {}) {
  return fetchJson(`/coletas/log${buildQuery(params)}`);
}

export function fetchColetaAtualizacaoStatus() {
  return fetchJson('/coletas/atualizacao/status');
}

export function fetchCoberturaPrefeitura(params = {}) {
  return fetchJson(`/cobertura/prefeitura${buildQuery(params)}`);
}

export function fetchResumoIaStatus(params = {}) {
  return fetchJson(`/ia/resumos/status${buildQuery(params)}`);
}

export function fetchResumoIaJobs(params = {}) {
  return fetchJson(`/ia/resumos/jobs${buildQuery(params)}`);
}

export function fetchAnalisesResumos(params = {}) {
  return fetchJson(`/analises/resumos${buildQuery(params)}`);
}
