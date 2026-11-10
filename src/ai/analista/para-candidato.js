'use strict';

/**
 * Achado aceito pelo verificador → candidato no contrato das vertentes (persistencia.js grava
 * sempre em 'revisao'). O texto declara que é apontamento de IA para conferência humana. Puro.
 */

const crypto = require('node:crypto');

const AVISO_IA =
  'Apontamento gerado por IA a partir dos documentos oficiais; as citações foram conferidas, mas o significado precisa de conferência humana.';
const CONFIANCA_PADRAO = 0.5;

const hash = texto => crypto.createHash('sha256').update(texto, 'utf8').digest('hex');

function evidenciaDoAchado(e) {
  return {
    papel: 'fonte',
    trecho: e.trecho,
    url_origem: e.url_origem,
    evidencia_hash: hash(`${e.fonte_id}|${e.trecho}`),
    metadados: { fonte_id: e.fonte_id },
  };
}

function achadoParaCandidato({ resultado, achado, ano }) {
  return {
    objeto: `analista|${resultado.chave}|${hash(achado.achado).slice(0, 12)}`,
    titulo: achado.achado,
    narrativa: [
      `${achado.por_que_suspeito}`,
      `Para confirmar: ${achado.o_que_falta_para_confirmar}`,
      AVISO_IA,
    ].join(' '),
    metrica: { nome: 'achado_analista', unidade: 'achado', tipo: achado.tipo, valor: 1 },
    evidencias: achado.evidencias.map(evidenciaDoAchado),
    periodo: { ano },
    severidade: 'info',
    categoria: 'Analista IA',
    confianca: achado.confianca ?? CONFIANCA_PADRAO,
    vertente: 'analista',
    versao: 1,
    campos_a_verificar: [achado.o_que_falta_para_confirmar],
    alerta: { tipo: 'analista_ia', subcategoria: achado.tipo },
  };
}

module.exports = { achadoParaCandidato, AVISO_IA };
