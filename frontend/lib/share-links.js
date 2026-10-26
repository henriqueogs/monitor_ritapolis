'use strict';

// Link de compartilhamento do WhatsApp; a UTM permite medir o canal no analytics.
function buildWhatsAppShareUrl({ title, url }) {
  const tagged = `${url}${url.includes('?') ? '&' : '?'}utm_source=whatsapp&utm_medium=share`;
  return `https://wa.me/?text=${encodeURIComponent(`${title}\n${tagged}`)}`;
}

module.exports = { buildWhatsAppShareUrl };
