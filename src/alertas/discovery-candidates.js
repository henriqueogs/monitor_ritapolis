'use strict';

const { slug } = require('./tipos');
const { detectarFatosAgregados } = require('./detectores/fatos-agregados');

const DEFAULT_TEMAS = {
  'meio_ambiente.supressao_arvores': true,
  'compras.precos_itens': true,
  'contratos.recorrencia_fornecedor_objeto': true,
  'eventos.gastos_eventos_publicos': true,
};

function anoFato(fato) {
  const data = fato.periodo_inicio || fato.data_evento || fato.documento_data_publicacao || fato.data_publicacao || '';
  const anoDoc = Number(fato.ano);
  if (Number.isInteger(anoDoc) && anoDoc > 1900) {
    return anoDoc;
  }
  const m = String(data).match(/^(\d{4})/);
  return m ? Number(m[1]) : null;
}

function dataFato(fato) {
  return fato.periodo_inicio || fato.data_evento || fato.documento_data_publicacao || fato.data_publicacao || null;
}

function chaveDoc(fato) {
  return `${fato.documento_id || 'doc'}:${fato.anexo_id || 'main'}`;
}

function dedupePorDocumento(fatos) {
  const out = new Map();
  for (const fato of fatos) {
    const key = chaveDoc(fato);
    const atual = out.get(key);
    const peso = Number(fato.valor || fato.quantidade || 0);
    const pesoAtual = Number(atual?.valor || atual?.quantidade || 0);
    if (!atual || peso > pesoAtual) {
      out.set(key, fato);
    }
  }
  return [...out.values()];
}

function periodo(fatos) {
  const datas = fatos.map(dataFato).filter(Boolean).sort();
  return {
    inicio: datas[0] || null,
    fim: datas[datas.length - 1] || null,
    ultima: datas[datas.length - 1] || null,
  };
}

function documentos(fatos) {
  const map = new Map();
  for (const fato of fatos) {
    if (!fato.documento_id || map.has(fato.documento_id)) {
      continue;
    }
    map.set(fato.documento_id, {
      documento_id: fato.documento_id,
      papel: 'evidencia',
      trecho_fonte: fato.trecho_fonte || fato.descricao || null,
    });
  }
  return [...map.values()];
}

function evidencias(fatos) {
  return fatos.map((fato) => ({
    documento_id: fato.documento_id || null,
    anexo_id: fato.anexo_id || null,
    fato_id: fato.id || null,
    papel: 'fato',
    trecho_fonte: fato.trecho_fonte || fato.descricao || null,
    metadados: {
      tipo: fato.tipo,
      subtipo: fato.subtipo,
      quantidade: fato.quantidade ?? null,
      unidade: fato.unidade || null,
      valor: fato.valor ?? null,
      descricao: fato.descricao || null,
    },
  }));
}

function mediaConfianca(fatos) {
  const vals = fatos.map((f) => f.confianca).filter((v) => typeof v === 'number');
  if (!vals.length) {
    return 0.7;
  }
  return Number((vals.reduce((sum, v) => sum + v, 0) / vals.length).toFixed(2));
}

function valorTotal(fatos) {
  return Number(fatos.reduce((sum, fato) => sum + (Number(fato.valor) || 0), 0).toFixed(2));
}

function porAno(fatos, filtro) {
  const map = new Map();
  for (const fato of fatos.filter(filtro)) {
    const ano = anoFato(fato);
    if (!ano) {
      continue;
    }
    const lista = map.get(ano) || [];
    lista.push(fato);
    map.set(ano, lista);
  }
  return map;
}

function temEvidenciaForte(alerta) {
  return (alerta.evidencias || []).length > 0 && (alerta.documentos_ids || []).length > 0;
}

function alertaBase({
  tipoInvestigacao,
  categoria,
  subcategoria,
  ano,
  titulo,
  narrativa,
  fatos,
  valor,
  unidade,
  label,
  prioridade,
  metricas = {},
  comparativos = {},
  campos = [],
  lacunas = [],
  questionamentos = [],
}) {
  const fatosUnicos = dedupePorDocumento(fatos);
  const docs = documentos(fatosUnicos);
  const p = periodo(fatosUnicos);
  return {
    tipo: 'tematico',
    categoria,
    subcategoria,
    severidade: prioridade >= 85 ? 'critico' : 'atencao',
    titulo,
    narrativa,
    chave_unica: `investigacao|${slug(tipoInvestigacao)}|${ano}`,
    documentos_ids: docs.map((d) => d.documento_id),
    periodo_inicio: p.inicio || `${ano}-01-01`,
    periodo_fim: p.fim || `${ano}-12-31`,
    ultima_publicacao_documento: p.ultima,
    valor_periodo_label: label || `Total em ${ano}`,
    valor_total: valor,
    questionamentos,
    confianca: mediaConfianca(fatosUnicos),
    metadados: {
      tipo_fato: tipoInvestigacao,
      discovery_kind: 'investigacao_factual',
      investigacao_tipo: tipoInvestigacao,
      tema: categoria,
      unidade,
      ano,
      prioridade,
      metricas,
      comparativos,
      campos_a_verificar: campos,
      lacunas_deterministicas: lacunas,
      publicacao: {
        automatica: true,
        elegivel: temEvidenciaForte({ documentos_ids: docs.map((d) => d.documento_id), evidencias: fatosUnicos }),
        motivo: 'candidato com evidencias vinculadas e tema prioritario',
      },
    },
    documentos: docs,
    evidencias: evidencias(fatosUnicos),
  };
}

function candidatosCompras(fatos) {
  const out = [];
  for (const [ano, lista] of porAno(fatos, (f) => f.tipo === 'compras' && f.subtipo === 'preco_item')) {
    const comValor = lista.filter((f) => Number(f.valor) > 0);
    if (comValor.length < 5) {
      continue;
    }
    const valores = comValor.map((f) => Number(f.valor)).sort((a, b) => a - b);
    const mediana = valores[Math.floor(valores.length / 2)] || 0;
    const outliers = comValor
      .filter((f) => Number(f.valor) >= Math.max(mediana * 4, 1000) || !f.unidade || Number(f.quantidade) > 100000)
      .sort((a, b) => Number(b.valor || 0) - Number(a.valor || 0))
      .slice(0, 12);
    if (outliers.length < 3) {
      continue;
    }
    out.push(alertaBase({
      tipoInvestigacao: 'compras.precos_itens',
      categoria: 'Compras e precos',
      subcategoria: 'Itens fora da curva',
      ano,
      titulo: `Precos e itens para conferir em ${ano}`,
      narrativa: `A camada factual encontrou ${outliers.length} itens com preco, unidade ou quantidade que merecem conferencia em ${ano}.`,
      fatos: outliers,
      valor: valorTotal(outliers),
      unidade: 'R$',
      label: `Itens priorizados em ${ano}`,
      prioridade: 88,
      metricas: { itens_priorizados: outliers.length, mediana_valor_unitario: mediana },
      comparativos: { criterio: 'valor >= 4x mediana anual, valor alto, unidade ausente ou quantidade extrema' },
      campos: ['unidade de medida', 'quantidade', 'valor unitario', 'valor final', 'fornecedor', 'trecho de origem'],
      lacunas: ['conferir se unidade e quantidade estao explicitadas nos documentos analisados'],
      questionamentos: [
        'As unidades e quantidades dos itens priorizados estao claras nos documentos?',
        'O valor final publicado confirma os valores extraidos por item?',
      ],
    }));
  }
  return out;
}

function candidatosContratos(fatos) {
  const out = [];
  for (const [ano, lista] of porAno(fatos, (f) => f.tipo === 'contratos' && f.subtipo === 'servico_recorrente')) {
    const unicos = dedupePorDocumento(lista);
    if (unicos.length < 10) {
      continue;
    }
    const priorizados = unicos.slice(0, 18);
    out.push(alertaBase({
      tipoInvestigacao: 'contratos.recorrencia_fornecedor_objeto',
      categoria: 'Contratos recorrentes',
      subcategoria: 'Recorrencia de objeto',
      ano,
      titulo: `Servicos recorrentes para investigar em ${ano}`,
      narrativa: `A camada factual encontrou ${unicos.length} documentos com sinais de servico recorrente em ${ano}.`,
      fatos: priorizados,
      valor: unicos.length,
      unidade: 'documentos',
      label: `Documentos com recorrencia em ${ano}`,
      prioridade: 82,
      metricas: { documentos_com_servico_recorrente: unicos.length },
      comparativos: { criterio: 'documentos com termos de prestacao, locacao, manutencao ou contratacao recorrente' },
      campos: ['fornecedor', 'CNPJ', 'valor final', 'objeto', 'vigencia', 'justificativa de recorrencia'],
      lacunas: ['conferir vencedor, CNPJ, valor e vigencia dos processos recorrentes'],
      questionamentos: [
        'Os mesmos objetos aparecem em mais de um processo no ano?',
        'Os documentos indicam vencedor, CNPJ, valor e vigencia de forma completa?',
      ],
    }));
  }
  return out;
}

function candidatosEventos(fatos) {
  const out = [];
  for (const [ano, lista] of porAno(fatos, (f) => f.tipo === 'eventos' && f.subtipo === 'evento_publico')) {
    const unicos = dedupePorDocumento(lista);
    if (unicos.length < 6) {
      continue;
    }
    const priorizados = unicos.slice(0, 16);
    out.push(alertaBase({
      tipoInvestigacao: 'eventos.gastos_eventos_publicos',
      categoria: 'Eventos publicos',
      subcategoria: 'Contratacoes de eventos',
      ano,
      titulo: `Contratacoes ligadas a eventos em ${ano}`,
      narrativa: `A camada factual encontrou ${unicos.length} documentos relacionados a eventos publicos em ${ano}.`,
      fatos: priorizados,
      valor: unicos.length,
      unidade: 'documentos',
      label: `Documentos de eventos em ${ano}`,
      prioridade: 80,
      metricas: { documentos_de_eventos: unicos.length },
      comparativos: { criterio: 'documentos com termos de evento, festa, show, exposicao ou festival' },
      campos: ['evento', 'objeto contratado', 'valor', 'fornecedor', 'entregaveis', 'justificativa', 'periodo de realizacao'],
      lacunas: ['conferir justificativa, entregaveis, valores e fornecedores dos eventos priorizados'],
      questionamentos: [
        'Os documentos deixam claro o evento, o objeto contratado e os entregaveis?',
        'Ha recorrencia de fornecedores ou objetos nas contratacoes de eventos?',
      ],
    }));
  }
  return out;
}

function temasAtivos(configTemas = {}) {
  return { ...DEFAULT_TEMAS, ...(configTemas || {}) };
}

function gerarCandidatosInvestigativos(fatos, options = {}) {
  const ativos = temasAtivos(options.temasAtivos);
  const out = [];
  if (ativos['meio_ambiente.supressao_arvores']) {
    out.push(...detectarFatosAgregados(fatos, {
      thresholdArvores: options.thresholdArvores || 20,
      minDocsRecorrencia: Number.MAX_SAFE_INTEGER,
    })
      .filter((a) => a.metadados?.investigacao_tipo === 'supressao_arvores')
      .map((a) => {
        const ano = Number(String(a.chave_unica || '').match(/\|ano\|(\d{4})/)?.[1] || a.metadados?.ano || 0);
        return {
          ...a,
          metadados: {
            ...(a.metadados || {}),
            ano,
            prioridade: 95,
            tema: 'Meio ambiente',
            campos_a_verificar: a.metadados?.campos_a_verificar || [
              'laudo tecnico',
              'autorizacao/licenca ambiental',
              'compensacao ou replantio',
              'localizacao detalhada',
              'especies',
              'altura ou diametro',
              'justificativa',
              'fotos ou mapas',
              'responsavel tecnico',
            ],
          },
        };
      }));
  }
  if (ativos['compras.precos_itens']) {
    out.push(...candidatosCompras(fatos));
  }
  if (ativos['contratos.recorrencia_fornecedor_objeto']) {
    out.push(...candidatosContratos(fatos));
  }
  if (ativos['eventos.gastos_eventos_publicos']) {
    out.push(...candidatosEventos(fatos));
  }
  return out.sort((a, b) => {
    const anoDiff = Number(b.metadados?.ano || 0) - Number(a.metadados?.ano || 0);
    if (anoDiff !== 0) {
      return anoDiff;
    }
    return (b.metadados?.prioridade || 0) - (a.metadados?.prioridade || 0);
  });
}

module.exports = {
  DEFAULT_TEMAS,
  gerarCandidatosInvestigativos,
  candidatosCompras,
  candidatosContratos,
  candidatosEventos,
  dedupePorDocumento,
};
