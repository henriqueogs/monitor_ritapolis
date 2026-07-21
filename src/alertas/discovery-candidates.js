'use strict';

const { slug } = require('./tipos');
const { detectarFatosAgregados } = require('./detectores/fatos-agregados');

const QUALITY_VERSION = 'discovery-quality-v3';

const DEFAULT_TEMAS = {
  'meio_ambiente.supressao_arvores': true,
  'compras.precos_itens': true,
  'contratos.recorrencia_fornecedor_objeto': true,
  'eventos.gastos_eventos_publicos': true,
};

const STOPWORDS_OBJETO = new Set([
  'a', 'ao', 'aos', 'as', 'com', 'contratacao', 'contratada', 'contratado',
  'da', 'das', 'de', 'do', 'dos', 'e', 'empresa', 'especializada', 'municipio',
  'na', 'nas', 'no', 'nos', 'para', 'por', 'prestacao', 'processo', 'ritapolis',
  'servico', 'servicos', 'uma', 'um', 'n', 'numero', 'dispensa', 'pregao', 'adesao',
]);

function normalizarTexto(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizarCnpj(valor) {
  const digits = String(valor || '').replace(/\D/g, '');
  return digits.length === 14 ? digits : null;
}

function tokensObjeto(texto) {
  return normalizarTexto(texto)
    .split(' ')
    .filter((token) => token.length > 2 && !STOPWORDS_OBJETO.has(token) && !/^\d+$/.test(token));
}

function chaveObjeto(texto) {
  return [...new Set(tokensObjeto(texto))].sort().join('-');
}

function similaridadeObjeto(a, b) {
  const aa = new Set(tokensObjeto(a));
  const bb = new Set(tokensObjeto(b));
  if (!aa.size || !bb.size) {return 0;}
  const intersecao = [...aa].filter((token) => bb.has(token)).length;
  const uniao = new Set([...aa, ...bb]).size;
  return uniao ? intersecao / uniao : 0;
}

function anoFato(fato) {
  const data = fato.periodo_inicio || fato.data_evento || fato.documento_data_publicacao || fato.data_publicacao || '';
  const anoDoc = Number(fato.ano);
  if (Number.isInteger(anoDoc) && anoDoc > 1900) {return anoDoc;}
  const match = String(data).match(/^(\d{4})/);
  return match ? Number(match[1]) : null;
}

function dataFato(fato) {
  return fato.periodo_inicio || fato.data_evento || fato.documento_data_publicacao || fato.data_publicacao || null;
}

function dedupePorDocumento(fatos) {
  const porDocumento = new Map();
  for (const fato of fatos) {
    if (!fato.documento_id) {continue;}
    const atual = porDocumento.get(fato.documento_id);
    const peso = Number(fato.valor || fato.quantidade || 0);
    const pesoAtual = Number(atual?.valor || atual?.quantidade || 0);
    const temAnexoMelhor = fato.anexo_id && !atual?.anexo_id;
    if (!atual || peso > pesoAtual || (peso === pesoAtual && temAnexoMelhor)) {
      porDocumento.set(fato.documento_id, fato);
    }
  }
  return [...porDocumento.values()];
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
  return dedupePorDocumento(fatos).map((fato) => ({
    documento_id: fato.documento_id,
    papel: 'evidencia',
    trecho_fonte: fato.trecho_fonte || fato.descricao || fato.titulo || null,
  }));
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
      url_origem: fato.url_origem || null,
      anexo_url: fato.anexo_url || null,
      fornecedor_nome: fato.vencedor_nome || fato.metadados?.fornecedor_nome || null,
      fornecedor_cnpj: fato.vencedor_cnpj || fato.metadados?.fornecedor_cnpj || null,
      documento_numero: fato.documento_numero || null,
    },
  }));
}

function mediaConfianca(fatos) {
  const valores = fatos.map((fato) => fato.confianca).filter((valor) => typeof valor === 'number');
  if (!valores.length) {return 0.7;}
  return Number((valores.reduce((total, valor) => total + valor, 0) / valores.length).toFixed(2));
}

function alertaBase({
  tipoInvestigacao,
  subjectKey,
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
  metricaPrincipal,
  metricas = {},
  comparativos = {},
  campos = [],
  lacunas = [],
  questionamentos = [],
  detalhes = {},
}) {
  const fatosUnicos = dedupePorDocumento(fatos);
  const docs = documentos(fatosUnicos);
  const faixa = periodo(fatosUnicos);
  return {
    tipo: 'tematico',
    categoria,
    subcategoria,
    severidade: prioridade >= 85 ? 'critico' : 'atencao',
    titulo,
    narrativa,
    chave_unica: `investigacao|${slug(tipoInvestigacao)}|${slug(subjectKey)}|${ano}`,
    documentos_ids: docs.map((doc) => doc.documento_id),
    periodo_inicio: faixa.inicio || `${ano}-01-01`,
    periodo_fim: faixa.fim || `${ano}-12-31`,
    ultima_publicacao_documento: faixa.ultima,
    valor_periodo_label: label || `Total em ${ano}`,
    valor_total: valor,
    questionamentos,
    confianca: mediaConfianca(fatosUnicos),
    estado_editorial: 'candidato',
    qualidade_versao: QUALITY_VERSION,
    qualidade_motivos: [],
    metadados: {
      tipo_fato: tipoInvestigacao,
      discovery_kind: 'investigacao_factual',
      investigacao_tipo: tipoInvestigacao,
      subject_key: subjectKey,
      tema: categoria,
      unidade,
      ano,
      prioridade,
      metrica_principal: metricaPrincipal || { nome: 'total', valor, unidade },
      metricas_deterministicas: metricas,
      comparativos_deterministicos: comparativos,
      campos_a_verificar: campos,
      lacunas_deterministicas: lacunas,
      ...detalhes,
    },
    documentos: docs,
    evidencias: evidencias(fatosUnicos),
  };
}

function mediana(valores) {
  const ordenados = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  if (ordenados.length % 2) {return ordenados[meio];}
  return (ordenados[meio - 1] + ordenados[meio]) / 2;
}

function nomeProduto(fato) {
  return String(fato.metadados?.descricao_normalizada || fato.descricao || '').trim();
}

function candidatosCompras(fatos) {
  const grupos = new Map();
  for (const fato of fatos.filter((item) => item.tipo === 'compras' && item.subtipo === 'preco_item')) {
    const ano = anoFato(fato);
    const produto = normalizarTexto(nomeProduto(fato));
    const unidade = normalizarTexto(fato.unidade);
    const valor = Number(fato.valor);
    if (!ano || !produto || !unidade || !(valor > 0)) {continue;}
    const chave = `${ano}|${produto}|${unidade}`;
    const lista = grupos.get(chave) || [];
    lista.push(fato);
    grupos.set(chave, lista);
  }

  const candidatos = [];
  for (const [chave, lista] of grupos.entries()) {
    const [anoTexto, produtoKey, unidade] = chave.split('|');
    const ano = Number(anoTexto);
    const amostra = dedupePorDocumento(lista);
    if (amostra.length < 3) {continue;}
    const valorMediano = mediana(amostra.map((fato) => Number(fato.valor)));
    const outliers = amostra.filter((fato) => {
      const valor = Number(fato.valor);
      return valor >= valorMediano * 4 && valor - valorMediano >= 1000;
    });
    for (const alvo of outliers) {
      const descricao = nomeProduto(alvo) || produtoKey;
      const fatosDescritos = amostra.map((fato) => ({
        ...fato,
        descricao: `${nomeProduto(fato) || descricao}: R$ ${Number(fato.valor).toFixed(2)} por ${fato.unidade}`,
      }));
      candidatos.push(alertaBase({
        tipoInvestigacao: 'compras.precos_itens',
        subjectKey: `produto|${produtoKey}|${unidade}|doc-${alvo.documento_id}`,
        categoria: 'Compras e precos',
        subcategoria: 'Item fora da curva',
        ano,
        titulo: `${descricao}: valor unitario acima da mediana em ${ano}`,
        narrativa: `O valor unitario de R$ ${Number(alvo.valor).toFixed(2)} pode ser comparado a mediana de R$ ${valorMediano.toFixed(2)} em ${amostra.length} documentos equivalentes.`,
        fatos: fatosDescritos,
        valor: Number(alvo.valor),
        unidade: 'R$',
        label: `Valor unitario em ${ano}`,
        prioridade: 88,
        metricaPrincipal: { nome: 'valor_unitario_alvo', valor: Number(alvo.valor), unidade: 'R$' },
        metricas: {
          valor_unitario_alvo: Number(alvo.valor),
          mediana_valor_unitario: Number(valorMediano.toFixed(2)),
          tamanho_amostra: amostra.length,
        },
        comparativos: {
          produto: descricao,
          produto_key: produtoKey,
          unidade,
          razao_mediana: Number((Number(alvo.valor) / valorMediano).toFixed(2)),
          documento_alvo_id: alvo.documento_id,
        },
        campos: ['unidade de medida', 'valor unitario', 'valor final', 'fornecedor', 'trecho de origem'],
        lacunas: ['conferir se especificacao e qualidade sao equivalentes entre os itens comparados'],
        questionamentos: ['A especificacao do item alvo e equivalente aos demais itens usados no comparativo?'],
        detalhes: {
          price_group: { produto_key: produtoKey, unidade, tamanho_amostra: amostra.length },
        },
      }));
    }
  }
  return candidatos;
}

function agruparObjetosSemelhantes(fatos, limiar = 0.75) {
  const grupos = [];
  for (const fato of dedupePorDocumento(fatos)) {
    const titulo = fato.titulo || fato.metadados?.documento_titulo || fato.descricao || '';
    const grupo = grupos.find((item) => similaridadeObjeto(item.referencia, titulo) >= limiar);
    if (grupo) {grupo.fatos.push(fato);}
    else {grupos.push({ referencia: titulo, fatos: [fato] });}
  }
  return grupos;
}

function candidatosContratos(fatos) {
  const porFornecedorAno = new Map();
  for (const fato of fatos.filter((item) => item.tipo === 'contratos' && item.subtipo === 'servico_recorrente')) {
    const ano = anoFato(fato);
    const cnpj = normalizarCnpj(fato.vencedor_cnpj || fato.metadados?.fornecedor_cnpj);
    if (!ano || !cnpj) {continue;}
    const chave = `${ano}|${cnpj}`;
    const lista = porFornecedorAno.get(chave) || [];
    lista.push(fato);
    porFornecedorAno.set(chave, lista);
  }

  const candidatos = [];
  for (const [chave, lista] of porFornecedorAno.entries()) {
    const [anoTexto, cnpj] = chave.split('|');
    const ano = Number(anoTexto);
    for (const grupo of agruparObjetosSemelhantes(lista)) {
      const fatosUnicos = dedupePorDocumento(grupo.fatos);
      if (fatosUnicos.length < 2) {continue;}
      const fornecedor = fatosUnicos.find((fato) => fato.vencedor_nome)?.vencedor_nome || `CNPJ ${cnpj}`;
      const objetoKey = chaveObjeto(grupo.referencia);
      const processos = fatosUnicos.map((fato) => fato.documento_numero || `doc ${fato.documento_id}`);
      const descritos = fatosUnicos.map((fato) => ({
        ...fato,
        descricao: `${fornecedor}: ${fato.titulo || fato.descricao}`,
      }));
      candidatos.push(alertaBase({
        tipoInvestigacao: 'contratos.recorrencia_fornecedor_objeto',
        subjectKey: `fornecedor|${cnpj}|objeto|${objetoKey}`,
        categoria: 'Contratos recorrentes',
        subcategoria: 'Recorrencia de fornecedor e objeto',
        ano,
        titulo: `${fornecedor}: objeto semelhante em ${fatosUnicos.length} processos de ${ano}`,
        narrativa: `${fornecedor} aparece em ${fatosUnicos.length} processos distintos com objetos equivalentes em ${ano}.`,
        fatos: descritos,
        valor: fatosUnicos.length,
        unidade: 'documentos',
        label: `Processos distintos em ${ano}`,
        prioridade: 82,
        metricaPrincipal: { nome: 'processos_recorrentes', valor: fatosUnicos.length, unidade: 'processos' },
        metricas: { processos_distintos: fatosUnicos.length },
        comparativos: { fornecedor, cnpj, objeto_key: objetoKey, processos },
        campos: ['fornecedor', 'CNPJ', 'objeto', 'valor final', 'vigencia'],
        lacunas: ['conferir diferenças de escopo, valor e vigencia entre os processos'],
        questionamentos: ['Os processos têm escopo, valor e vigência equivalentes?'],
        detalhes: {
          recurrence_group: { fornecedor, cnpj, objeto_key: objetoKey, processos },
        },
      }));
    }
  }
  return candidatos;
}

function extrairEvento(fato) {
  const texto = normalizarTexto(`${fato.titulo || ''} ${fato.trecho_fonte || ''}`);
  let match = texto.match(/(\d{1,3})\s*(?:a|o)?\s*exposicao agropecuaria(?: e artesanato)?/);
  if (match) {
    return { key: `${match[1]}-exposicao-agropecuaria`, nome: `${match[1]}ª Exposição Agropecuária` };
  }
  if (/\bcarnaval\b/.test(texto)) {return { key: 'carnaval', nome: 'Carnaval' };}
  match = texto.match(/\b(festa|festival)\s+(?:de|do|da)\s+([a-z0-9 ]{3,50})/);
  if (match) {
    const complemento = match[2].split(' ').slice(0, 5).join(' ');
    return { key: slug(`${match[1]}-${complemento}`), nome: `${match[1]} ${complemento}` };
  }
  return null;
}

function candidatosEventos(fatos) {
  const grupos = new Map();
  for (const fato of fatos.filter((item) => item.tipo === 'eventos' && item.subtipo === 'evento_publico')) {
    const ano = anoFato(fato);
    const evento = extrairEvento(fato);
    if (!ano || !evento) {continue;}
    const chave = `${ano}|${evento.key}`;
    const grupo = grupos.get(chave) || { ano, evento, fatos: [] };
    grupo.fatos.push(fato);
    grupos.set(chave, grupo);
  }

  const candidatos = [];
  for (const grupo of grupos.values()) {
    const fatosUnicos = dedupePorDocumento(grupo.fatos);
    if (fatosUnicos.length < 2) {continue;}
    const descritos = fatosUnicos.map((fato) => ({
      ...fato,
      descricao: `${grupo.evento.nome}: ${fato.titulo || fato.descricao}`,
    }));
    const valorFinal = fatosUnicos.reduce((total, fato) => total + (Number(fato.documento_valor_final) || 0), 0);
    const valorEstimado = fatosUnicos.reduce((total, fato) => total + (Number(fato.documento_valor_estimado) || 0), 0);
    candidatos.push(alertaBase({
      tipoInvestigacao: 'eventos.gastos_eventos_publicos',
      subjectKey: `evento|${grupo.evento.key}|${grupo.ano}`,
      categoria: 'Eventos publicos',
      subcategoria: 'Contratacoes de evento identificado',
      ano: grupo.ano,
      titulo: `${grupo.evento.nome}: ${fatosUnicos.length} contratacoes em ${grupo.ano}`,
      narrativa: `${fatosUnicos.length} processos distintos foram vinculados a ${grupo.evento.nome} em ${grupo.ano}.`,
      fatos: descritos,
      valor: fatosUnicos.length,
      unidade: 'documentos',
      label: `Processos do evento em ${grupo.ano}`,
      prioridade: 80,
      metricaPrincipal: { nome: 'processos_do_evento', valor: fatosUnicos.length, unidade: 'processos' },
      metricas: {
        processos_distintos: fatosUnicos.length,
        valor_final_identificado: Number(valorFinal.toFixed(2)),
        valor_estimado_identificado: Number(valorEstimado.toFixed(2)),
      },
      comparativos: { evento: grupo.evento.nome, evento_key: grupo.evento.key },
      campos: ['evento', 'objeto contratado', 'valor', 'fornecedor', 'entregaveis', 'periodo de realizacao'],
      lacunas: ['conferir valores finais, fornecedores e entregaveis dos processos vinculados'],
      questionamentos: [`Quais objetos, fornecedores e valores compõem as contratações de ${grupo.evento.nome}?`],
      detalhes: { event_group: { event_key: grupo.evento.key, evento: grupo.evento.nome } },
    }));
  }
  return candidatos;
}

function candidatosArvores(fatos, thresholdArvores) {
  const fatosPorId = new Map(fatos.map((fato) => [Number(fato.id), fato]));
  return detectarFatosAgregados(fatos, {
    thresholdArvores,
    minDocsRecorrencia: Number.MAX_SAFE_INTEGER,
  })
    .filter((alerta) => alerta.metadados?.investigacao_tipo === 'supressao_arvores')
    .map((alerta) => {
      const ano = Number(String(alerta.chave_unica || '').match(/\|ano\|(\d{4})/)?.[1] || alerta.metadados?.ano || 0);
      return {
        ...alerta,
        evidencias: (alerta.evidencias || []).map((evidencia) => {
          const fonte = fatosPorId.get(Number(evidencia.fato_id));
          return {
            ...evidencia,
            metadados: {
              ...(evidencia.metadados || {}),
              descricao: fonte?.descricao || evidencia.trecho_fonte || null,
              url_origem: fonte?.url_origem || null,
              anexo_url: fonte?.anexo_url || null,
            },
          };
        }),
        estado_editorial: 'candidato',
        qualidade_versao: QUALITY_VERSION,
        qualidade_motivos: [],
        metadados: {
          ...(alerta.metadados || {}),
          ano,
          prioridade: 95,
          tema: 'Meio ambiente',
          subject_key: `supressao-arvores|${ano}`,
          metrica_principal: { nome: 'total_arvores', valor: alerta.valor_total, unidade: 'arvores' },
          metricas_deterministicas: {
            total_arvores: alerta.valor_total,
            documentos_distintos: alerta.documentos_ids.length,
          },
          comparativos_deterministicos: {},
          campos_a_verificar: alerta.metadados?.campos_a_verificar || [
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
    });
}

function temasAtivos(configTemas = {}) {
  return { ...DEFAULT_TEMAS, ...(configTemas || {}) };
}

function gerarCandidatosInvestigativos(fatos, options = {}) {
  const ativos = temasAtivos(options.temasAtivos);
  const candidatos = [];
  if (ativos['meio_ambiente.supressao_arvores']) {
    candidatos.push(...candidatosArvores(fatos, options.thresholdArvores || 20));
  }
  if (ativos['compras.precos_itens']) {candidatos.push(...candidatosCompras(fatos));}
  if (ativos['contratos.recorrencia_fornecedor_objeto']) {candidatos.push(...candidatosContratos(fatos));}
  if (ativos['eventos.gastos_eventos_publicos']) {candidatos.push(...candidatosEventos(fatos));}
  return candidatos.sort((a, b) => {
    const ano = Number(b.metadados?.ano || 0) - Number(a.metadados?.ano || 0);
    return ano || Number(b.metadados?.prioridade || 0) - Number(a.metadados?.prioridade || 0);
  });
}

module.exports = {
  QUALITY_VERSION,
  DEFAULT_TEMAS,
  gerarCandidatosInvestigativos,
  candidatosCompras,
  candidatosContratos,
  candidatosEventos,
  dedupePorDocumento,
  normalizarTexto,
  chaveObjeto,
  similaridadeObjeto,
  extrairEvento,
};
