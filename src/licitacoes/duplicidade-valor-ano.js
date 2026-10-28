'use strict';

// Mede (sem corrigir) quanto do valor_final somado por ano viria de documentos
// do mesmo processo (fiscal-valores, achado 3/V3). Funções puras: o script
// scripts/medir-duplicidade-valor-ano.js lê o banco e chama medirDuplicidadePorAno.

const { normalizeProcessoChave } = require('./processo');
const { parseModalidadeEdital } = require('./modalidade');
const { normalizarControlePncp } = require('./pncp-resultados');

const TIPO_EDITAL = 'edital';
const MAX_EXEMPLOS = 5;
const CENTAVOS = 100;

// Cada estratégia devolve a chave do processo ou null (documento fica sozinho).
const ESTRATEGIAS = {
  grupo: doc => (doc.grupo_id ? `g:${doc.grupo_id}` : null),
  pncp: doc => {
    const controle = doc.numero_pncp ? normalizarControlePncp(doc.numero_pncp) : null;
    return controle ? `p:${controle}` : null;
  },
  processo: doc => {
    const chave = normalizeProcessoChave(doc.numero);
    return chave && doc.ano ? `n:${chave}|${doc.ano}` : null;
  },
  modalidade: doc => {
    const mod = parseModalidadeEdital(doc.titulo);
    return mod && mod.numero !== null ? `m:${mod.tipo}|${mod.numero}|${mod.ano}` : null;
  },
};

function arredondar(valor) {
  return Math.round(valor * CENTAVOS) / CENTAVOS;
}

// Mesmo critério de escolherDocumentoCanonico, com edital antes de extrato.
function compararCanonico(a, b) {
  return Number(a.tipo !== TIPO_EDITAL) - Number(b.tipo !== TIPO_EDITAL) || a.id - b.id;
}

function agruparPorChave(docs, estrategia) {
  const grupos = new Map();
  docs.forEach(doc => {
    const chave = ESTRATEGIAS[estrategia](doc) || `d:${doc.id}`;
    if (!grupos.has(chave)) {
      grupos.set(chave, []);
    }
    grupos.get(chave).push(doc);
  });
  return grupos;
}

function medirEstrategia(docs, estrategia) {
  const grupos = agruparPorChave(docs, estrategia);
  let somaDedup = 0;
  const exemplos = [];
  grupos.forEach((membros, chave) => {
    const ordenados = [...membros].sort(compararCanonico);
    somaDedup += Number(ordenados[0].valor_final);
    if (membros.length > 1 && exemplos.length < MAX_EXEMPLOS) {
      exemplos.push({
        chave,
        documentos: ordenados.map(({ id, tipo, valor_final }) => ({ id, tipo, valor_final })),
      });
    }
  });
  return { distintos: grupos.size, soma_dedup: arredondar(somaDedup), exemplos };
}

function medirAno(ano, docs) {
  const somaBruta = arredondar(docs.reduce((acc, doc) => acc + Number(doc.valor_final), 0));
  const estrategias = {};
  Object.keys(ESTRATEGIAS).forEach(nome => {
    const medida = medirEstrategia(docs, nome);
    estrategias[nome] = { ...medida, excesso: arredondar(somaBruta - medida.soma_dedup) };
  });
  return {
    ano,
    documentos: docs.length,
    editais: docs.filter(doc => doc.tipo === TIPO_EDITAL).length,
    soma_bruta: somaBruta,
    estrategias,
  };
}

/**
 * docs: [{ id, tipo, ano, numero, titulo, numero_pncp, grupo_id, valor_final }],
 * só os que entram na soma (valor_final não nulo). Devolve uma linha por ano,
 * do mais recente ao mais antigo, com a soma bruta e a soma por estratégia de dedup.
 */
function medirDuplicidadePorAno(docs = []) {
  const porAno = new Map();
  docs
    .filter(doc => doc.ano && doc.valor_final !== null && doc.valor_final !== undefined)
    .forEach(doc => {
      if (!porAno.has(doc.ano)) {
        porAno.set(doc.ano, []);
      }
      porAno.get(doc.ano).push(doc);
    });
  return [...porAno.entries()]
    .sort(([a], [b]) => b - a)
    .map(([ano, lista]) => medirAno(ano, lista));
}

module.exports = {
  ESTRATEGIAS,
  medirDuplicidadePorAno,
};
