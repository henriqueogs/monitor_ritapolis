'use strict';

/**
 * Processo licitatório e adesão a ata citados no histórico dos empenhos ("CONFORME PROCESSO
 * LICITATÓRIO N°52/25", "ADESÃO N°12/2025"). Serve à vertente de compras repetidas: um empenho
 * que cita um processo presente no acervo está coberto por instrumento; o que cita um processo
 * ausente aponta onde conferir. Puro.
 */

const { extrairProcessoCitado } = require('../detectores/empenhado-acima-contratado');

const SECULO = 2000;
const DIGITOS_ANO_CURTO = 2;
const RE_ADESAO = /ades[aã]o\s*n?[°º.o]*\s*(\d+)\s*\/\s*(\d{2,4})/i;

const chave = (numero, ano) => `${Number(numero)}/${ano}`;
const anoCompleto = texto =>
  texto.length === DIGITOS_ANO_CURTO ? SECULO + Number(texto) : Number(texto);

function citacoesDoHistorico(historico) {
  const processo = extrairProcessoCitado(historico);
  const adesao = RE_ADESAO.exec(String(historico ?? ''));
  return {
    processo: processo ? chave(processo.numero, processo.ano) : null,
    adesao: adesao ? chave(adesao[1], anoCompleto(adesao[2])) : null,
  };
}

function contar(chaves) {
  const contagem = new Map();
  for (const c of chaves) {contagem.set(c, (contagem.get(c) || 0) + 1);}
  return [...contagem.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([chaveCitada, n]) => ({ chave: chaveCitada, n }));
}

function resumirCitacoes(empenhos) {
  const lidas = empenhos.map(e => citacoesDoHistorico(e.historico));
  return {
    processos: contar(lidas.map(l => l.processo).filter(Boolean)),
    adesoes: contar(lidas.map(l => l.adesao).filter(Boolean)),
    semCitacao: lidas.filter(l => !l.processo && !l.adesao).length,
    total: empenhos.length,
  };
}

function frasesDasCitacoes({ processos, adesoes, total }) {
  if (!processos.length && !adesoes.length) {
    return {
      severidade: 'atencao',
      achado:
        'Os históricos dos empenhos não citam processo nem adesão a ata, e o sistema não ' +
        'localizou contrato, ata ou licitação desse credor no acervo.',
    };
  }
  const partes = [
    ...processos.map(p => `Processo ${p.chave} (${p.n} de ${total} empenhos)`),
    ...adesoes.map(a => `Adesão ${a.chave} (${a.n} de ${total} empenhos)`),
  ];
  return {
    severidade: 'info',
    achado:
      `Os históricos citam: ${partes.join('; ')}. O sistema não localizou esse processo no ` +
      'acervo (ele não está entre os documentos coletados) nem contrato ou ata do credor; ' +
      'confira no portal ou na prefeitura se o processo e a adesão cobrem o objeto e o período.',
  };
}

module.exports = { citacoesDoHistorico, resumirCitacoes, frasesDasCitacoes };
