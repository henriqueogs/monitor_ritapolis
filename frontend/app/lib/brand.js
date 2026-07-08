// Fonte única da marca — todo texto/título público importa daqui.
export const BRAND = 'Ritápolis.com';
export const BRAND_TAGLINE = 'A cidade em dados abertos';
export const SITE_URL = 'https://ritapolis.com';

export function tituloPagina(titulo) {
  return `${titulo} — ${BRAND}`;
}
