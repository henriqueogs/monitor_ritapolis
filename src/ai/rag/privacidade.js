'use strict';

/** Mascaramento de dados pessoais em texto que entra no índice ou sai na resposta (LGPD, fiscal-privacidade L1). */

const CPF = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g;
const CPF_MASCARADO = '***.***.***-**';

const mascararCpf = texto => String(texto ?? '').replace(CPF, CPF_MASCARADO);

module.exports = { mascararCpf, CPF_MASCARADO };
