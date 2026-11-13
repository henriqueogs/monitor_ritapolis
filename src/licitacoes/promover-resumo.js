'use strict';

/**
 * Promove datas e valores que o resumo de IA já extraiu (com trecho citado) para as colunas
 * estruturadas do documento. Só vale o que o trecho confirma no texto do próprio documento;
 * coluna já preenchida nunca é sobrescrita. Puro: devolve só os campos a gravar e as recusas.
 */

const DATA_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const TOLERANCIA_ANOS_ABERTURA = 1;
const TOLERANCIA_ANOS_HOMOLOGACAO = 2;
const MAX_DIAS_ABERTURA_ANTES_DA_PUBLICACAO = 30;
const MS_POR_DIA = 86400000;
// O resumo às vezes rotula como "abertura" a data de um pedido/orçamento ou de um evento (ex.:
// inauguração): só vale quando a descrição fala de abertura, sessão, propostas, inscrição etc.
const DESCRICAO_DE_ABERTURA =
  /abertura|sess[aã]o|credenciamento|recebimento|envelope|propostas?|entrega|certame|licita|lance|disputa|julgamento|preg[aã]o|in[ií]cio|inscri/i;
const DESCRICAO_NAO_ABERTURA = /pedido|or[cç]amento|cota[cç][aã]o|nota fiscal|emiss/i;

const normalizar = texto =>
  String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const trechoConfirmado = (item, textoNormalizado) => {
  const trecho = normalizar(item?.trecho_fonte);
  return trecho.length > 0 && textoNormalizado.includes(trecho);
};

function anoDe(data) {
  const m = DATA_ISO.exec(String(data ?? ''));
  return m ? Number(m[1]) : null;
}

function anoPlausivel(data, anoDoc, tolerancia) {
  const ano = anoDe(data);
  if (ano === null) {
    return false;
  }
  return !anoDoc || (ano >= anoDoc - tolerancia && ano <= anoDoc + tolerancia);
}

function diasEntre(inicio, fim) {
  return Math.round((new Date(fim) - new Date(inicio)) / MS_POR_DIA);
}

function escolherAbertura(resumo, documento, texto, recusas) {
  const candidatas = (resumo.datas_relevantes || []).filter(i => i?.tipo === 'abertura');
  const validas = candidatas.filter(i => {
    if (!anoPlausivel(i.data, documento.ano, TOLERANCIA_ANOS_ABERTURA)) {
      recusas.push(`abertura ${i.data}: data malformada ou fora do ano do documento`);
      return false;
    }
    const descricao = String(i.descricao ?? '');
    if (DESCRICAO_NAO_ABERTURA.test(descricao) || !DESCRICAO_DE_ABERTURA.test(descricao)) {
      recusas.push(
        `abertura ${i.data}: descrição não indica abertura (pedido, orçamento, evento…)`
      );
      return false;
    }
    if (
      documento.data_publicacao &&
      diasEntre(documento.data_publicacao, i.data) < -MAX_DIAS_ABERTURA_ANTES_DA_PUBLICACAO
    ) {
      recusas.push(`abertura ${i.data}: mais de 30 dias antes da publicação`);
      return false;
    }
    if (!trechoConfirmado(i, texto)) {
      recusas.push(`abertura ${i.data}: trecho não encontrado no texto`);
      return false;
    }
    return true;
  });
  return validas.map(i => i.data).sort()[0];
}

function escolherEstimado(resumo, texto, recusas) {
  const estimados = (resumo.valores || []).filter(i => i?.tipo === 'estimado' && i.valor > 0);
  const confirmados = estimados.filter(i => {
    if (!trechoConfirmado(i, texto)) {
      recusas.push(`estimado ${i.valor}: trecho não encontrado no texto`);
      return false;
    }
    return true;
  });
  const alvo =
    confirmados.length > 1
      ? confirmados.filter(i => /total|global/i.test(String(i.descricao ?? '')))
      : confirmados;
  const distintos = [...new Set(alvo.map(i => i.valor))];
  if (distintos.length > 1) {
    recusas.push('valor estimado ambíguo: mais de um total distinto');
    return undefined;
  }
  return distintos[0];
}

function escolherHomologacao(resumo, documento, abertura, texto) {
  const piso = abertura || documento.data_abertura;
  return (resumo.datas_relevantes || [])
    .filter(
      i =>
        i?.tipo === 'homologacao' &&
        anoPlausivel(i.data, documento.ano, TOLERANCIA_ANOS_HOMOLOGACAO) &&
        (!piso || i.data >= piso) &&
        trechoConfirmado(i, texto)
    )
    .map(i => i.data)
    .sort()[0];
}

function promoverDoResumo({ resumo, documento }) {
  const recusas = [];
  if (!resumo || !documento) {
    return { recusas };
  }
  const texto = normalizar(documento.texto_completo);
  const promovido = { recusas };
  const abertura = documento.data_abertura
    ? undefined
    : escolherAbertura(resumo, documento, texto, recusas);
  if (abertura) {
    promovido.data_abertura = abertura;
  }
  const estimado =
    documento.valor_estimado > 0 ? undefined : escolherEstimado(resumo, texto, recusas);
  if (estimado) {
    promovido.valor_estimado = estimado;
  }
  const homologacao = escolherHomologacao(resumo, documento, abertura, texto);
  if (homologacao) {
    promovido.data_homologacao = homologacao;
  }
  return promovido;
}

module.exports = { promoverDoResumo };
