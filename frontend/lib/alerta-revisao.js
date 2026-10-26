'use strict';

// CommonJS de propósito (mesmo padrão de lib/perguntar.js): testável pelo Jest da raiz.
//
// Lógica pura da revisão de alertas (descobertas) no admin e da métrica exibida nos cards
// públicos. Regras de produto: contagem nunca vira "R$" (§11.1) e toda evidência leva à
// fonte oficial (§11.3).

const UNIDADE_REAIS = 'R$';
const KIND_FACTUAL = 'investigacao_factual';
const STATUS_APROVADO = 'aprovado';
// Tipos cuja regra vem da subcategoria (detectores sobre empenhos).
const TIPOS_REGRA_NA_SUBCATEGORIA = new Set(['gasto_atipico', 'execucao_contratual', 'conflito_interesse']);

const ROTULO_UNIDADE = Object.freeze({
  arvores: 'árvores',
  documentos: 'documentos',
  processos: 'processos',
  ocorrencia: 'ocorrência(s)',
});

const FORMATO_REAIS = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

// O que cada regra olha e quando dispara. Os limites citados são os padrões do código
// (src/alertas/); o painel de configuração pode ter mudado alguns.
const REGRAS = Object.freeze({
  'meio_ambiente.supressao_arvores': {
    nome: 'Supressão de árvores no ano',
    explicacao:
      'Soma as árvores citadas em fatos de supressão/corte extraídos dos documentos e anexos do ano. ' +
      'Dispara quando o total passa do limite configurado (alertas:investigacao_min_arvores).',
  },
  'compras.precos_itens': {
    nome: 'Preço unitário fora da curva',
    explicacao:
      'Compara o valor unitário do mesmo item, na mesma unidade e no mesmo ano, em pelo menos 3 documentos. ' +
      'Dispara quando o valor é 4 vezes a mediana ou mais e fica ao menos R$ 1.000 acima dela.',
  },
  'contratos.recorrencia_fornecedor_objeto': {
    nome: 'Mesmo fornecedor, mesmo objeto',
    explicacao:
      'Agrupa contratos do mesmo CNPJ no mesmo ano com objeto parecido. ' +
      'Dispara com 2 ou mais processos distintos. Repetir fornecedor não é irregular por si só.',
  },
  'eventos.gastos_eventos_publicos': {
    nome: 'Contratações de um mesmo evento',
    explicacao:
      'Junta processos que citam o mesmo evento (Carnaval, Exposição etc.) no ano. ' +
      'Dispara com 2 ou mais processos; serve para ver o custo total do evento.',
  },
  'riscos.alerta_resumo_ia': {
    nome: 'Risco apontado pela IA no resumo',
    explicacao:
      'Vem da leitura da IA sobre o resumo do documento, não de um trecho literal do PDF. ' +
      'Precisa ser conferido no documento oficial antes de qualquer publicação.',
  },
  empenhado_acima_contratado: {
    nome: 'Empenhado acima do contratado',
    explicacao:
      'Soma os empenhos do fornecedor que citam o processo no histórico (sem ordens de pagamento) e compara ' +
      'com o valor do contrato lido no extrato ou contrato publicado. Dispara acima de 125% (limite de ' +
      'acréscimo do art. 125 da Lei 14.133) e com excesso de ao menos R$ 10.000. Aditivo não publicado ' +
      'ou empenho citando o processo errado também explicam a diferença.',
  },
  socio_servidor: {
    nome: 'Sócio com o mesmo nome de servidor',
    explicacao:
      'Cruza o quadro societário (Receita) das empresas que receberam empenhos com a folha da Prefeitura. ' +
      'Dispara com nome completo (3+ palavras), uma única pessoa com esse nome na folha e o mesmo ano de folha ' +
      'e de empenho. A Receita não traz o CPF do sócio, então pode ser homônimo. Alerta interno: não é publicável.',
  },
  gasto_atipico_credor: {
    nome: 'Um recebedor concentra a categoria',
    explicacao:
      'Um credor recebeu 40% ou mais de tudo que foi empenhado na categoria no ano, ' +
      'com ao menos R$ 50.000 e 4 recebedores na categoria (gasto_atipico.*).',
  },
  gasto_atipico_salto: {
    nome: 'Salto anual de gasto na categoria',
    explicacao:
      'O gasto da categoria no ano ficou 3 vezes ou mais acima do ano anterior, ' +
      'com ao menos R$ 50.000 (gasto_atipico.*).',
  },
});
const SINONIMOS_REGRA = Object.freeze({ supressao_arvores: 'meio_ambiente.supressao_arvores' });

const SINAIS_LEGADO = Object.freeze({
  repeticao_tematica: 'repetição de processos da mesma categoria no ano',
  risco_alto: 'risco alto citado no resumo da IA',
  valor_relevante: 'soma de valores acima do limite',
  anomalia_temporal: 'pico de processos acima da média dos outros anos',
  questionamento: 'questionamentos levantados no resumo da IA',
});

const MOTIVOS_DESCARTE_OPCOES = Object.freeze([
  { codigo: 'ADMIN_FALSO_POSITIVO', rotulo: 'falso positivo' },
  { codigo: 'ADMIN_EVIDENCIA_INSUFICIENTE', rotulo: 'evidência insuficiente' },
  { codigo: 'ADMIN_DADO_EXTRAIDO_ERRADO', rotulo: 'dado extraído errado (nome, valor, data)' },
  { codigo: 'ADMIN_LINGUAGEM_INADEQUADA', rotulo: 'linguagem inadequada ou acusatória' },
  { codigo: 'ADMIN_DUPLICADO', rotulo: 'duplicado de outro alerta' },
  { codigo: 'ADMIN_SEM_RELEVANCIA', rotulo: 'sem relevância para o cidadão' },
  { codigo: 'ADMIN_OUTRO', rotulo: 'outro (explicar na nota)' },
]);

const ROTULO_PENDENCIA = Object.freeze({
  SEM_EVIDENCIA: 'sem evidência vinculada',
  SEM_FONTE: 'evidência sem link da fonte',
  NOME_PLACEHOLDER: 'nome em branco de modelo',
  LINGUAGEM_ACUSATORIA: 'linguagem acusatória',
  RISCO_SO_DA_IA: 'risco só da leitura da IA',
  PUBLICADO_SEM_GATE: 'publicado sem gate factual',
  NAO_INVESTIGADO: 'IA ainda não investigou',
  GATE_REPROVADO: 'gate de qualidade reprovou',
  LEGADO: 'detector antigo',
  VALOR_SEM_PERIODO: 'total sem período',
});

const ROTULO_RECOMENDACAO = Object.freeze({
  nao_publicar: 'Não publicar como está',
  conferir: 'Conferir antes de publicar',
  ok: 'Sem pendência automática',
});

const PREFIXO_NOTA = 'NOTA: ';
const PREFIXO_REVALIDACAO = 'REVALIDACAO_';
const PREFIXO_CONFERIDO = 'CONFERIDO: ';

const ehUrlHttp = (valor) => /^https?:\/\//i.test(String(valor ?? '').trim());

function formatarMetricaAlerta(alerta) {
  const valor = Number(alerta?.valor_total);
  if (alerta?.valor_total === null || alerta?.valor_total === undefined || !valor) {
    return null;
  }
  const unidade = alerta.metadados?.unidade;
  if (!unidade || unidade === UNIDADE_REAIS) {
    return { texto: FORMATO_REAIS.format(valor), monetario: true };
  }
  const rotulo = ROTULO_UNIDADE[unidade] || unidade;
  return { texto: `${valor.toLocaleString('pt-BR')} ${rotulo}`, monetario: false };
}

function descreverLegado(sinais) {
  const descricoes = sinais.map((s) => SINAIS_LEGADO[s] || s);
  return {
    codigo: 'legado',
    nome: 'Detector antigo (sem gate de qualidade)',
    explicacao: `Disparado por: ${descricoes.join('; ')}.`,
  };
}

function descreverRegra(alerta) {
  const metadados = alerta?.metadados || {};
  const bruto =
    TIPOS_REGRA_NA_SUBCATEGORIA.has(alerta?.tipo) ? alerta.subcategoria : metadados.investigacao_tipo || metadados.tipo_fato;
  if (!bruto && Array.isArray(metadados.sinais) && metadados.sinais.length) {
    return descreverLegado(metadados.sinais);
  }
  const codigo = SINONIMOS_REGRA[bruto] || bruto || 'desconhecida';
  const regra = REGRAS[codigo];
  if (!regra) {
    return { codigo, nome: codigo, explicacao: 'Regra sem descrição cadastrada no painel.' };
  }
  return { codigo, ...regra };
}

function adicionar(links, link) {
  if (!ehUrlHttp(link.url) && link.tipo !== 'interno') {
    return;
  }
  if (links.some((l) => l.url === link.url)) {
    return;
  }
  links.push(link);
}

function linksDaEvidencia(evidencia, documentosPorId) {
  const metadados = evidencia?.metadados || {};
  const documento = documentosPorId.get(Number(evidencia?.documento_id));
  const links = [];
  for (const url of [evidencia?.anexo_url, metadados.anexo_url, documento?.url_pdf]) {
    adicionar(links, { tipo: 'arquivo', rotulo: 'Abrir arquivo oficial', url });
  }
  for (const url of [metadados.portal_url, metadados.url_origem, documento?.url_origem]) {
    adicionar(links, { tipo: 'origem', rotulo: 'Página da fonte', url });
  }
  if (metadados.empenho_id) {
    adicionar(links, { tipo: 'interno', rotulo: 'Ver empenho', url: `/empenho/${metadados.empenho_id}` });
  }
  if (evidencia?.documento_id) {
    adicionar(links, { tipo: 'interno', rotulo: 'Ver no acervo', url: `/documento/${evidencia.documento_id}` });
  }
  return links;
}

// Alerta de regra determinística (sem IA): o servidor manda `gate_deterministico`
// com os campos que o revisor precisa marcar; a revalidação não pode ter pendência.
function situacaoDeterministica(alerta) {
  const gate = alerta.gate_deterministico;
  if (gate.somenteAdmin) {
    return {
      deterministico: true,
      somenteAdmin: true,
      investigado: false,
      podePublicar: false,
      campos: [],
      pendente: false,
      motivos: [],
      bloqueio: gate.bloqueio,
    };
  }
  const pendencias = alerta.revalidacao?.pendencias || [];
  return {
    deterministico: true,
    investigado: false,
    podePublicar: false,
    campos: alerta.gate_deterministico.campos || [],
    pendente: pendencias.length > 0,
    motivos: [],
    bloqueio: pendencias.length
      ? `Revalidação apontou: ${pendencias.map((p) => p.mensagem || p.codigo).join('; ')}`
      : 'Regra determinística: marque cada item conferido nas fontes para publicar.',
  };
}

function situacaoGate(alerta) {
  if (alerta?.gate_deterministico?.aplicavel) {
    return situacaoDeterministica(alerta);
  }
  const metadados = alerta?.metadados || {};
  const qualidade = metadados.discovery_v3?.qualidade;
  if (!qualidade) {
    const factual = metadados.discovery_kind === KIND_FACTUAL;
    return {
      investigado: false,
      podePublicar: false,
      motivos: [],
      bloqueio: factual
        ? 'A IA ainda não investigou este candidato. Use "Reprocessar" para rodar a investigação e o gate factual.'
        : 'Alerta sem investigação factual: não pode ser publicado por este fluxo.',
    };
  }
  const aprovado = qualidade.factual_status === STATUS_APROVADO;
  return {
    investigado: true,
    podePublicar: aprovado,
    factual: qualidade.factual_status || null,
    editorial: qualidade.editorial_status || null,
    motivos: qualidade.motivos || [],
    bloqueio: aprovado ? null : 'O gate factual reprovou a investigação; veja os motivos abaixo.',
  };
}

function liberadoParaPublicar(gate, marcados) {
  if (!gate?.deterministico) {
    return Boolean(gate?.podePublicar);
  }
  if (gate.somenteAdmin) {
    return false;
  }
  return !gate.pendente && gate.campos.every((campo) => marcados.has(campo));
}

function rotuloMotivo(codigo) {
  const texto = String(codigo ?? '');
  if (texto.startsWith(PREFIXO_CONFERIDO)) {
    return `Conferido pelo revisor: ${texto.slice(PREFIXO_CONFERIDO.length)}`;
  }
  if (texto.startsWith(PREFIXO_NOTA)) {
    return `Nota do revisor: ${texto.slice(PREFIXO_NOTA.length)}`;
  }
  if (texto.startsWith(PREFIXO_REVALIDACAO)) {
    const pendencia = texto.slice(PREFIXO_REVALIDACAO.length);
    return `Revalidação: ${ROTULO_PENDENCIA[pendencia] || pendencia}`;
  }
  const opcao = MOTIVOS_DESCARTE_OPCOES.find((o) => o.codigo === texto);
  return opcao ? `Descartado: ${opcao.rotulo}` : texto;
}

// Chaves de métricas determinísticas que são valores em reais (exibidas como R$).
const RE_CHAVE_MONETARIA = /^valor_|^excesso$/;
const PAPEL_EMPENHO = 'empenho';
const TITULO_POR_PAPEL = Object.freeze({
  quadro_societario: 'Quadro societário (Receita Federal)',
  folha: 'Folha de pagamento da Prefeitura',
});

function tituloEvidencia(evidencia) {
  if (evidencia?.documento_titulo || evidencia?.anexo_nome) {
    return evidencia.documento_titulo || evidencia.anexo_nome;
  }
  const metadados = evidencia?.metadados || {};
  if (evidencia?.papel === PAPEL_EMPENHO && metadados.empenho) {
    return `Empenho ${metadados.empenho}${metadados.exercicio ? ` (${metadados.exercicio})` : ''}`;
  }
  return TITULO_POR_PAPEL[evidencia?.papel] || `Evidência #${evidencia?.id}`;
}

function formatarPar(chave, valor) {
  if (valor === null || valor === undefined) return '—';
  if (typeof valor === 'number') {
    return RE_CHAVE_MONETARIA.test(chave) ? FORMATO_REAIS.format(valor) : valor.toLocaleString('pt-BR');
  }
  if (Array.isArray(valor)) return valor.join(', ');
  if (typeof valor === 'object') return JSON.stringify(valor);
  return String(valor);
}

module.exports = {
  formatarMetricaAlerta,
  tituloEvidencia,
  formatarPar,
  descreverRegra,
  linksDaEvidencia,
  situacaoGate,
  liberadoParaPublicar,
  rotuloMotivo,
  MOTIVOS_DESCARTE_OPCOES,
  ROTULO_PENDENCIA,
  ROTULO_RECOMENDACAO,
};
