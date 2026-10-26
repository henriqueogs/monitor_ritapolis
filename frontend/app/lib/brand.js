// Fonte única da marca — todo texto/título público importa daqui.
import { MARCA, SITE_URL as SITE } from '../../lib/ente';

export const BRAND = MARCA;
export const BRAND_TAGLINE = 'A cidade em dados abertos';
export const SITE_URL = SITE;

export function tituloPagina(titulo) {
  return `${titulo} — ${BRAND}`;
}
