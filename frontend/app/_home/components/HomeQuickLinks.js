import Link from 'next/link';
import { FERRAMENTAS } from '../../lib/modulos';

// Ferramentas que atravessam as duas áreas (mapa único em lib/modulos.js).
export default function HomeQuickLinks() {
  return (
    <nav className="ferramentas" aria-label="Ferramentas">
      <span className="ferramentas-rotulo">Ferramentas</span>
      {FERRAMENTAS.map(({ href, titulo, icone: Icone }) => (
        <Link key={href} href={href} prefetch={false}>
          <Icone size={16} aria-hidden="true" />
          {titulo}
        </Link>
      ))}
    </nav>
  );
}
