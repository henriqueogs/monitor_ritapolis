// Sem ISR: renderiza por requisição, com o CSP de nonce (ver frontend/lib/csp.js).
import SessaoPage, { generateMetadata } from './index';
export { generateMetadata };
export const dynamic = 'force-dynamic';
export default SessaoPage;
