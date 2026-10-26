import { buildWhatsAppShareUrl } from '../../lib/share-links';
import { SITE_URL } from '../lib/brand';

// Link simples (sem JS no cliente): abre o WhatsApp com título + URL canônica da página.
export default function ShareWhatsApp({ path, title }) {
  const href = buildWhatsAppShareUrl({ title, url: `${SITE_URL}${path}` });
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="availability-badge is-real"
      style={{ textDecoration: 'none' }}
    >
      Compartilhar no WhatsApp
    </a>
  );
}
