'use strict';

// Normalização de CNPJ. As tabelas guardam CNPJ em formatos mistos (despesas em
// dígitos, produtos formatado, detalhes misto), o que fragmenta o mesmo
// fornecedor e quebra o join "licitado vs pago". Usar a forma normalizada (14
// dígitos) como chave de agrupamento/join, e a formatada para exibição.

const CNPJ_DIGITOS = 14;

function normalizarCnpj(value) {
  const digitos = String(value || '').replace(/\D/g, '');
  return digitos.length === CNPJ_DIGITOS ? digitos : null;
}

function cnpjValido(value) {
  return normalizarCnpj(value) !== null;
}

function formatarCnpj(value) {
  const d = normalizarCnpj(value);
  if (!d) {
    return null;
  }
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

module.exports = {
  normalizarCnpj,
  formatarCnpj,
  cnpjValido,
};
