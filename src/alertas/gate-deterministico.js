'use strict';

// Gate de publicação para alertas de regra determinística (sem IA). Puro.
//
// O gate factual da IA (discovery_v3.qualidade) não existe nesses alertas: o
// achado vem de conta sobre dados oficiais. Para publicar, exige-se:
//  1. revalidação sem nenhuma pendência (fonte, período, linguagem);
//  2. o revisor marcou, um a um, os campos que o detector pediu para conferir.
// As confirmações vão para o histórico editorial com PREFIXO_CONFERIDO.
//
// Alerta marcado `somente_admin` (cruza dados pessoais, ex.: sócio × folha) é
// conferência interna: nunca pode ser publicado, com ou sem conferência.

const VERSOES_DETERMINISTICAS = new Set(['execucao-contratual-v1', 'socio-servidor-v1']);
const BLOQUEIO_SOMENTE_ADMIN =
  'Alerta interno: cruza dados pessoais e serve só para conferência no admin; não pode ser publicado.';
const CAMPO_PADRAO = 'achado conferido nas fontes';
const PREFIXO_CONFERIDO = 'CONFERIDO: ';

const NAO_APLICAVEL = Object.freeze({
  aplicavel: false,
  somenteAdmin: false,
  podePublicar: false,
  campos: [],
  faltando: [],
  bloqueio: null,
});

function ehDeterministico(alerta) {
  return VERSOES_DETERMINISTICAS.has(alerta?.qualidade_versao) || Boolean(alerta?.metadados?.somente_admin);
}

function camposAConferir(alerta) {
  const campos = alerta?.metadados?.campos_a_verificar;
  return Array.isArray(campos) && campos.length ? campos.map(String) : [CAMPO_PADRAO];
}

function descreverBloqueio(pendencias, faltando) {
  if (pendencias.length) {
    return `Revalidação apontou: ${pendencias.map((p) => p.mensagem || p.codigo).join('; ')}`;
  }
  if (faltando.length) {
    return `Marque o que você conferiu: ${faltando.join(', ')}.`;
  }
  return null;
}

function avaliarGateDeterministico(alerta, revalidacao, { conferidos = [] } = {}) {
  if (!ehDeterministico(alerta)) {
    return { ...NAO_APLICAVEL };
  }
  if (alerta.metadados?.somente_admin) {
    return {
      aplicavel: true,
      somenteAdmin: true,
      podePublicar: false,
      campos: [],
      faltando: [],
      bloqueio: BLOQUEIO_SOMENTE_ADMIN,
    };
  }
  const campos = camposAConferir(alerta);
  const marcados = new Set((Array.isArray(conferidos) ? conferidos : []).map(String));
  const faltando = campos.filter((campo) => !marcados.has(campo));
  const pendencias = revalidacao?.pendencias || [];
  return {
    aplicavel: true,
    somenteAdmin: false,
    podePublicar: !pendencias.length && !faltando.length,
    campos,
    faltando,
    bloqueio: descreverBloqueio(pendencias, faltando),
  };
}

module.exports = { avaliarGateDeterministico, ehDeterministico, PREFIXO_CONFERIDO };
