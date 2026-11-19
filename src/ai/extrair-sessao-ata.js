'use strict';

/** Extrai presença e votações de uma ata com IA e confere o resultado contra o texto. */

const crypto = require('crypto');
const { createAiProvider } = require('./providers');
const { extrairObjetoJson } = require('./ports/json-resposta');
const { buildSessaoAtaPrompt } = require('./prompts/sessao-ata-prompt');
const { SessaoAtaContract, VERSAO_EXTRATOR } = require('./contracts/sessao-ata-contract');
const { validarExtracaoSessao } = require('../camara/sessao-ata');

const TEXTO_MINIMO = 300;
const TAMANHO_HASH = 16;

function hashTexto(texto) {
  return crypto.createHash('sha256').update(String(texto || '')).digest('hex').slice(0, TAMANHO_HASH);
}

function conferirContrato(bruto) {
  const parsed = SessaoAtaContract.safeParse(bruto);
  if (!parsed.success) {
    const problemas = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'raiz'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Extração de sessão fora do contrato: ${problemas}`);
  }
  return parsed.data;
}

/**
 * @param {{id: number, titulo: string, texto_completo: string}} ata
 * @returns {Promise<{sessao, avisos, status, provider, modelo, texto_hash, versao_extrator}>}
 */
async function extrairSessaoDaAta(ata, { provider } = {}) {
  const texto = String(ata?.texto_completo || '');
  if (texto.trim().length < TEXTO_MINIMO) {
    throw new Error(`Ata ${ata?.id} sem texto suficiente para extrair a sessão`);
  }
  const ia = provider || createAiProvider();
  let bruto;
  try {
    bruto = await ia.generateJson({
      prompt: buildSessaoAtaPrompt({ titulo: ata.titulo, texto }),
      temperature: 0,
    });
  } catch (err) {
    throw new Error(`IA falhou na ata ${ata.id} [${ia.model}]: ${err.message}`, { cause: err });
  }
  const extracao = conferirContrato(extrairObjetoJson(bruto));
  return {
    ...validarExtracaoSessao(extracao, texto),
    provider: ia.provider,
    modelo: ia.model,
    texto_hash: hashTexto(texto),
    versao_extrator: VERSAO_EXTRATOR,
  };
}

module.exports = { extrairSessaoDaAta, hashTexto };
