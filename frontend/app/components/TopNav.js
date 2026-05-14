import Link from 'next/link';

const links = [
  { href: '/', label: 'Inicio' },
  { href: '/analises', label: 'Analises' },
  { href: '/temas', label: 'Temas' },
  { href: '/licitacoes', label: 'Licitacoes' },
  { href: '/documentos', label: 'Acervo' },
  { href: '/sobre', label: 'Sobre' }
];

export default function TopNav() {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link href="/" className="brand">
          <strong>Monitor Ritapolis</strong>
          <span>Inteligencia publica verificavel</span>
        </Link>

        <nav className="topnav" aria-label="Principal">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="topnav-link">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
