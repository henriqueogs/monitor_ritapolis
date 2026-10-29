'use strict';

const { SEVERIDADE } = require('../tipos');

/**
 * Contrato de vertente (Na Lupa v4, trilha 1) e orquestrador puro.
 * Vertente = { nome, versao, criterio, detectar(contexto) → candidatos[] }.
 * Candidato = { objeto, metrica, evidencias[{fonte_id,url_origem,...}], periodo, severidade }.
 * Persistência e gates editoriais ficam fora: este módulo só valida e coleta.
 */

const SEVERIDADES = Object.values(SEVERIDADE);

function validarVertente(vertente) {
  const erros = [];
  if (!vertente?.nome) {erros.push('nome ausente');}
  if (!vertente?.versao) {erros.push('versao ausente');}
  if (!vertente?.criterio) {erros.push('criterio ausente');}
  if (typeof vertente?.detectar !== 'function') {erros.push('detectar ausente');}
  return erros;
}

function validarCandidato(candidato) {
  const erros = [];
  if (!candidato?.objeto) {erros.push('objeto ausente');}
  if (!candidato?.metrica) {erros.push('metrica ausente');}
  if (!candidato?.periodo) {erros.push('periodo ausente (valor deve ser escopado no tempo)');}
  if (!SEVERIDADES.includes(candidato?.severidade)) {erros.push('severidade invalida');}
  const evidencias = candidato?.evidencias;
  if (!Array.isArray(evidencias) || evidencias.length === 0) {
    erros.push('evidencias ausentes');
  } else if (evidencias.some(e => !e?.url_origem)) {
    erros.push('evidencia sem url_origem');
  }
  return erros;
}

function rodarVertente(contexto, vertente) {
  const bruto = vertente.detectar(contexto) || [];
  const validos = [];
  for (const candidato of bruto) {
    if (validarCandidato(candidato).length === 0) {
      validos.push({ ...candidato, vertente: vertente.nome, versao: vertente.versao });
    }
  }
  return { validos, descartados: bruto.length - validos.length };
}

function rodarVertentes(contexto, vertentes) {
  const candidatos = [];
  const resumo = {};
  for (const vertente of vertentes) {
    const nome = vertente?.nome || '(sem nome)';
    const erros = validarVertente(vertente);
    if (erros.length > 0) {
      resumo[nome] = {
        candidatos: 0,
        descartados: 0,
        erro: `contrato invalido: ${erros.join(', ')}`,
      };
      continue;
    }
    try {
      const { validos, descartados } = rodarVertente(contexto, vertente);
      candidatos.push(...validos);
      resumo[nome] = { candidatos: validos.length, descartados, erro: null };
    } catch (err) {
      resumo[nome] = { candidatos: 0, descartados: 0, erro: err.message };
    }
  }
  return { candidatos, resumo };
}

module.exports = { validarVertente, validarCandidato, rodarVertentes };
