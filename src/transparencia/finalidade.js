'use strict';

const { classificarCategoria } = require('./categorias');

const CLASSIFICACAO_FINALIDADE_VERSAO = 'finalidade-v2';

const FINALIDADES = Object.freeze({
  ordem_pagamento: { rotulo: 'Ordem de pagamento', tom: 'neutro' },
  licitacao: { rotulo: 'Licita\u00e7\u00e3o', tom: 'gov' },
  diaria_servidor: { rotulo: 'Di\u00e1ria', tom: 'servidor' },
  transferencia_entidade: { rotulo: 'Entidade', tom: 'entidade' },
  pessoal_encargos: { rotulo: 'Folha', tom: 'pessoal' },
  auxilio_pf: { rotulo: 'Aux\u00edlio', tom: 'auxilio' },
  distribuicao_gratuita: { rotulo: 'Distribui\u00e7\u00e3o gratuita', tom: 'auxilio' },
  premiacao: { rotulo: 'Premia\u00e7\u00e3o', tom: 'auxilio' },
  servico_pf: { rotulo: 'Servi\u00e7o PF', tom: 'servico' },
  servico_pj_sem_licitacao: { rotulo: 'Servi\u00e7o PJ', tom: 'servico' },
  investimento: { rotulo: 'Investimento', tom: 'investimento' },
  sentenca_judicial: { rotulo: 'Senten\u00e7a judicial', tom: 'gov' },
  indenizacao_restituicao: { rotulo: 'Indeniza\u00e7\u00e3o/Restitui\u00e7\u00e3o', tom: 'neutro' },
  outros: { rotulo: 'Outros', tom: 'neutro' },
});

function textoNormalizado(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

function textoBusca(despesa = {}) {
  return textoNormalizado([
    despesa.historico,
    despesa.credor_nome,
    despesa.categoria_economica,
    despesa.modalidade,
    despesa.licitacao_ref,
  ].filter(Boolean).join(' '));
}

function naoVazio(valor) {
  return String(valor || '').trim() !== '';
}

function categoriaComecaCom(despesa, prefixos) {
  const categoria = String(despesa?.categoria_economica || '').trim();
  return prefixos.some((prefixo) => categoria.startsWith(prefixo));
}

function contem(texto, termos) {
  return termos.some((termo) => texto.includes(textoNormalizado(termo)));
}

function evidencia(lista, campo, valor, motivo) {
  if (!naoVazio(valor) && valor !== 0) { return; }
  lista.push({
    campo,
    valor: String(valor),
    motivo,
  });
}

function slugModalidade(modalidade) {
  const texto = textoNormalizado(modalidade)
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
  if (!texto) { return null; }
  if (texto.includes('PREGAO')) { return 'pregao'; }
  if (texto.includes('DISPENSA')) { return 'dispensa'; }
  if (texto.includes('INEXIGIBILIDADE')) { return 'inexigibilidade'; }
  if (texto.includes('CONCORRENCIA')) { return 'concorrencia'; }
  if (texto.includes('TOMADA')) { return 'tomada_precos'; }
  if (texto.includes('CONVITE')) { return 'convite'; }
  return texto.toLowerCase().replace(/\s+/g, '_').slice(0, 40);
}

function criarBaseMarcadores(despesa, categoria) {
  const marcadores = new Set();
  if (categoria?.slug && categoria.slug !== 'outros') {
    marcadores.add(`categoria:${categoria.slug}`);
  }
  if (categoria?.grupo) {
    marcadores.add(`grupo:${categoria.grupo}`);
  }
  if (naoVazio(despesa.credor_cargo)) {
    marcadores.add('cargo_credor');
  }
  if (naoVazio(despesa.credor_cnpj)) {
    marcadores.add('credor_pj');
  } else {
    marcadores.add('credor_pf_sem_cpf_publico');
  }
  if (naoVazio(despesa.documento_id)) {
    marcadores.add('documento_vinculado');
  }
  if (naoVazio(despesa.licitacao_ref)) {
    marcadores.add('licitacao_ref');
  }
  if (naoVazio(despesa.modalidade)) {
    const modalidade = slugModalidade(despesa.modalidade);
    marcadores.add(modalidade ? `modalidade:${modalidade}` : 'modalidade');
  }
  return marcadores;
}

function finalizar({ classe, subclasse, confianca, evidencias, marcadores, regra }) {
  const meta = FINALIDADES[classe] || FINALIDADES.outros;
  return {
    classe_principal: classe,
    rotulo: meta.rotulo,
    tom: meta.tom,
    subclasse: subclasse || null,
    confianca: Math.max(0, Math.min(1, Number(confianca.toFixed(2)))),
    marcadores: Array.from(marcadores).sort(),
    evidencias,
    versao: CLASSIFICACAO_FINALIDADE_VERSAO,
    regra,
  };
}

function classificarFinalidadeDespesa(despesa = {}) {
  const texto = textoBusca(despesa);
  const categoria = classificarCategoria(despesa.categoria_economica);
  const marcadores = criarBaseMarcadores(despesa, categoria);
  const evidencias = [];
  const tipo = textoNormalizado(despesa.tipo);

  if (tipo.startsWith('OP')) {
    evidencia(evidencias, 'tipo', despesa.tipo, 'ordem de pagamento nao e novo empenho orcamentario');
    return finalizar({
      classe: 'ordem_pagamento',
      subclasse: 'pagamento',
      confianca: 0.98,
      evidencias,
      marcadores,
      regra: 'tipo_op',
    });
  }

  const temDocumento = Number(despesa.documento_id) > 0;
  const temLicitacao = temDocumento || naoVazio(despesa.licitacao_ref) || naoVazio(despesa.modalidade);
  if (temLicitacao) {
    evidencia(evidencias, 'documento_id', despesa.documento_id, 'empenho vinculado a documento municipal');
    evidencia(evidencias, 'licitacao_ref', despesa.licitacao_ref, 'referencia de licitacao no portal');
    evidencia(evidencias, 'modalidade', despesa.modalidade, 'modalidade licitatoria informada');
    return finalizar({
      classe: 'licitacao',
      subclasse: slugModalidade(despesa.modalidade) || categoria.slug,
      confianca: temDocumento ? 0.95 : 0.9,
      evidencias,
      marcadores,
      regra: temDocumento ? 'documento_vinculado' : 'licitacao_ref_modalidade',
    });
  }

  if (categoriaComecaCom(despesa, ['3.3.90.14']) || contem(texto, ['DIARIA', 'DIARIAS'])) {
    evidencia(evidencias, 'categoria_economica', despesa.categoria_economica, 'elemento de despesa de diarias');
    evidencia(evidencias, 'historico', despesa.historico, 'historico menciona diaria');
    evidencia(evidencias, 'credor_cargo', despesa.credor_cargo, 'cargo do servidor veio do portal');
    return finalizar({
      classe: 'diaria_servidor',
      subclasse: categoria.slug,
      confianca: categoriaComecaCom(despesa, ['3.3.90.14']) ? 0.94 : 0.78,
      evidencias,
      marcadores,
      regra: 'diaria_categoria_ou_texto',
    });
  }

  if (
    categoriaComecaCom(despesa, ['3.3.50']) ||
    contem(texto, ['SUBVENCAO', 'SUBVENCOES', 'REPASSE', 'TERMO DE FOMENTO', 'TERMO DE COLABORACAO', 'CONVENIO', 'APAE', 'ASSOCIACAO'])
  ) {
    evidencia(evidencias, 'categoria_economica', despesa.categoria_economica, 'transferencia a entidade sem fins lucrativos');
    evidencia(evidencias, 'historico', despesa.historico, 'historico sugere repasse ou convenio');
    return finalizar({
      classe: 'transferencia_entidade',
      subclasse: categoria.slug,
      confianca: categoriaComecaCom(despesa, ['3.3.50']) ? 0.9 : 0.72,
      evidencias,
      marcadores,
      regra: 'entidade_categoria_ou_texto',
    });
  }

  if (
    categoriaComecaCom(despesa, ['3.1']) ||
    contem(texto, ['FOLHA DE PAGAMENTO', 'PAGAMENTO FOLHA', 'VENCIMENTOS', 'OBRIGACOES PATRONAIS', 'INSS', 'FGTS', 'PASEP'])
  ) {
    evidencia(evidencias, 'categoria_economica', despesa.categoria_economica, 'grupo de pessoal ou encargos');
    evidencia(evidencias, 'credor_nome', despesa.credor_nome, 'credor/historico indica folha ou encargos');
    return finalizar({
      classe: 'pessoal_encargos',
      subclasse: categoria.slug,
      confianca: categoriaComecaCom(despesa, ['3.1']) ? 0.92 : 0.75,
      evidencias,
      marcadores,
      regra: 'pessoal_categoria_ou_texto',
    });
  }

  if (categoriaComecaCom(despesa, ['3.3.90.48']) || contem(texto, ['AUXILIO', 'AUXILIOS', 'SUBSIDIAR', 'TRANSPORTE ESCOLAR'])) {
    evidencia(evidencias, 'categoria_economica', despesa.categoria_economica, 'auxilio financeiro a pessoa fisica');
    evidencia(evidencias, 'historico', despesa.historico, 'historico sugere auxilio/subsidio');
    return finalizar({
      classe: 'auxilio_pf',
      subclasse: categoria.slug,
      confianca: categoriaComecaCom(despesa, ['3.3.90.48']) ? 0.9 : 0.7,
      evidencias,
      marcadores,
      regra: 'auxilio_pf_categoria_ou_texto',
    });
  }

  if (categoriaComecaCom(despesa, ['3.3.90.91'])) {
    evidencia(evidencias, 'categoria_economica', despesa.categoria_economica, 'pagamento de sentenca judicial');
    evidencia(evidencias, 'historico', despesa.historico, 'historico do processo judicial');
    return finalizar({
      classe: 'sentenca_judicial',
      subclasse: categoria.slug,
      confianca: 0.92,
      evidencias,
      marcadores,
      regra: 'sentenca_judicial_categoria',
    });
  }

  if (categoriaComecaCom(despesa, ['3.3.90.93', '3.3.90.94', '3.3.90.95'])) {
    evidencia(evidencias, 'categoria_economica', despesa.categoria_economica, 'indenizacao ou restituicao');
    evidencia(evidencias, 'historico', despesa.historico, 'historico da indenizacao/restituicao');
    return finalizar({
      classe: 'indenizacao_restituicao',
      subclasse: categoria.slug,
      confianca: 0.9,
      evidencias,
      marcadores,
      regra: 'indenizacao_restituicao_categoria',
    });
  }

  if (categoriaComecaCom(despesa, ['3.3.90.31'])) {
    evidencia(evidencias, 'categoria_economica', despesa.categoria_economica, 'premiacao cultural, cientifica, artistica ou desportiva');
    return finalizar({
      classe: 'premiacao',
      subclasse: categoria.slug,
      confianca: 0.9,
      evidencias,
      marcadores,
      regra: 'premiacao_categoria',
    });
  }

  if (categoriaComecaCom(despesa, ['3.3.90.32'])) {
    evidencia(evidencias, 'categoria_economica', despesa.categoria_economica, 'material/bem/servico para distribuicao gratuita');
    return finalizar({
      classe: 'distribuicao_gratuita',
      subclasse: categoria.slug,
      confianca: 0.9,
      evidencias,
      marcadores,
      regra: 'distribuicao_gratuita_categoria',
    });
  }

  if (categoriaComecaCom(despesa, ['3.3.90.36'])) {
    evidencia(evidencias, 'categoria_economica', despesa.categoria_economica, 'servico contratado de pessoa fisica');
    return finalizar({
      classe: 'servico_pf',
      subclasse: categoria.slug,
      confianca: 0.9,
      evidencias,
      marcadores,
      regra: 'servico_pf_categoria',
    });
  }

  if (categoriaComecaCom(despesa, ['3.3.90.39', '3.3.93.39'])) {
    evidencia(evidencias, 'categoria_economica', despesa.categoria_economica, 'servico de pessoa juridica sem licitacao vinculada');
    return finalizar({
      classe: 'servico_pj_sem_licitacao',
      subclasse: categoria.slug,
      confianca: 0.86,
      evidencias,
      marcadores,
      regra: 'servico_pj_sem_licitacao_categoria',
    });
  }

  if (categoriaComecaCom(despesa, ['4.'])) {
    evidencia(evidencias, 'categoria_economica', despesa.categoria_economica, 'grupo de investimento');
    return finalizar({
      classe: 'investimento',
      subclasse: categoria.slug,
      confianca: 0.84,
      evidencias,
      marcadores,
      regra: 'investimento_categoria',
    });
  }

  evidencia(evidencias, 'categoria_economica', despesa.categoria_economica, 'sem regra especifica de finalidade');
  return finalizar({
    classe: 'outros',
    subclasse: categoria.slug,
    confianca: 0.55,
    evidencias,
    marcadores,
    regra: 'fallback_outros',
  });
}

function getFinalidadeMeta(classe) {
  return FINALIDADES[classe] || FINALIDADES.outros;
}

module.exports = {
  CLASSIFICACAO_FINALIDADE_VERSAO,
  FINALIDADES,
  classificarFinalidadeDespesa,
  getFinalidadeMeta,
};
