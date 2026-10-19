'use strict';

/**
 * Mascaramento de dados pessoais em texto que entra no índice ou sai na resposta (LGPD,
 * fiscal-privacidade L1): CPF (com pontuação, ou sem pontuação quando rotulado "CPF"), e-mail e
 * telefone brasileiro. Conservador de propósito: números de processo, empenho, CNPJ e valores
 * em reais não casam.
 */

const CPF = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g;
const CPF_ROTULADO = /(\bCPF\b[^\d\n]{0,6})\d{11}(?!\d)/gi;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const TELEFONE = /(?<![\d,.])\(?\d{2}\)?[\s.]?9?\d{4}-\d{4}(?!\d)/g;

const CPF_MASCARADO = '***.***.***-**';
const EMAIL_MASCARADO = '[e-mail oculto]';
const TELEFONE_MASCARADO = '[telefone oculto]';

function mascararCpf(texto) {
  return String(texto ?? '')
    .replace(CPF, CPF_MASCARADO)
    .replace(CPF_ROTULADO, `$1${CPF_MASCARADO}`)
    .replace(EMAIL, EMAIL_MASCARADO)
    .replace(TELEFONE, TELEFONE_MASCARADO);
}

module.exports = { mascararCpf, CPF_MASCARADO };
