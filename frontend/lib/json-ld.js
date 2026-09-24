'use strict';

/**
 * Serializa JSON-LD para dentro de <script type="application/ld+json">.
 * JSON.stringify não escapa "<": um nome vindo do Portal/Câmara contendo
 * "</script><script>…" fecharia o bloco e executaria código — e nas rotas ISR
 * o CSP libera script inline (HTML em cache não tem nonce). Escapar "<" e os
 * separadores U+2028/U+2029 mantém o JSON idêntico ao ser lido.
 */
function serializarJsonLd(dado) {
  return JSON.stringify(dado)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

module.exports = { serializarJsonLd };
