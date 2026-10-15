'use strict';

/**
 * Service do painel de transparência: compõe o resumo do repositório com a
 * convenção de mandato e os deep-links do portal da fonte. Rotas HTTP delegam
 * aqui — nenhuma agregação de negócio fica em server.js.
 */

const {
  getPainelResumo,
  getDespesas,
  getDespesasPorDocumento,
} = require('../db/transparencia-repo');
const { agruparPorMandato, resolverExercicios, montarPeriodo } = require('../utils/mandato');
const { comLinkPortal } = require('./portal-links');
const { memoTtl } = require('../utils/memo-ttl');
const { registrar } = require('../services/cache-registry');

const TTL_MS = 10 * 60 * 1000;

const CAMPOS_SOMA_MANDATO = [
  'n_empenhos',
  'valor_total',
  'valor_estimado_global',
  'valor_empenhado',
  'n_empenhos_vinculados',
  'valor_receita_previsto',
];

/**
 * @param {{ exercicio?: number, mandato?: number }} filtro — `mandato` é QUALQUER ano
 * dentro do mandato (ver utils/mandato); escopa pelos 4 exercícios correspondentes.
 */
function getPainelTransparenciaSemCache({ exercicio, mandato } = {}) {
  const exercicios = exercicio ? undefined : resolverExercicios({ mandato });
  const filtroRepo = exercicios ? { exercicios } : { exercicio };

  const painel = getPainelResumo(filtroRepo);
  return {
    ...painel,
    periodo: montarPeriodo({ exercicio, mandato }, painel.porAno),
    porMandato: agruparPorMandato(painel.porAno, {
      anoKey: 'exercicio',
      camposSoma: CAMPOS_SOMA_MANDATO,
    }),
    ultimosEmpenhos: comLinkPortal(painel.ultimosEmpenhos),
  };
}

const getPainelTransparencia = registrar(
  memoTtl(getPainelTransparenciaSemCache, {
    ttlMs: TTL_MS,
    key: ({ exercicio, mandato } = {}) => `${exercicio || ''}:${mandato || ''}`
  })
);

function getDespesasComPortal(filtros = {}) {
  const resultado = getDespesas(filtros);
  return { ...resultado, dados: comLinkPortal(resultado.dados) };
}

function getDespesasDocumentoComPortal(documentoId) {
  return comLinkPortal(getDespesasPorDocumento(documentoId));
}

module.exports = {
  getPainelTransparencia,
  getDespesasComPortal,
  getDespesasDocumentoComPortal,
};
