'use strict';

// Escolha do anexo cujo texto pode representar um documento sem texto próprio
// (PDF principal escaneado ou ausente). Editais-anexo descrevem o processo;
// "outro" pode conter o edital completo com nome genérico. Propostas e recursos
// nunca representam o documento.

const MIN_CHARS_TEXTO_UTIL = 500;
const TIPOS_PROMOVIVEIS = ['edital', 'outro'];

function temTextoUtil(anexo) {
  return (
    anexo.status_extracao === 'ok' &&
    (anexo.texto_completo || '').length >= MIN_CHARS_TEXTO_UTIL
  );
}

/**
 * Retorna o melhor anexo para promover como texto do documento, ou null.
 * Preferência: tipo 'edital' antes de 'outro'; dentro do tipo, o maior texto.
 */
function escolherMelhorTextoAnexo(anexos) {
  const candidatos = (anexos || []).filter(
    (a) => TIPOS_PROMOVIVEIS.includes(a.tipo) && temTextoUtil(a)
  );

  if (candidatos.length === 0) {
    return null;
  }

  candidatos.sort((a, b) => {
    const tipoDiff = TIPOS_PROMOVIVEIS.indexOf(a.tipo) - TIPOS_PROMOVIVEIS.indexOf(b.tipo);
    if (tipoDiff !== 0) {
      return tipoDiff;
    }
    return (b.texto_completo || '').length - (a.texto_completo || '').length;
  });

  return candidatos[0];
}

module.exports = {
  escolherMelhorTextoAnexo,
  MIN_CHARS_TEXTO_UTIL,
};
