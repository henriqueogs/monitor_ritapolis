import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import AdminModeToggle from './AdminModeToggle';

const links = [
  { href: '/', label: 'Início' },
  { href: '/analises', label: 'Análises' },
  { href: '/temas', label: 'Temas' },
  { href: '/licitacoes', label: 'Licitações' },
  { href: '/documentos', label: 'Acervo' },
  { href: '/sobre', label: 'Sobre' }
];

export default function TopNav() {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link href="/" className="brand">
          <div className="brand-icon">
            <Sparkles size={16} strokeWidth={2.5} />
          </div>
          <div className="brand-text">
            <strong>Monitor Ritápolis</strong>
            <span>Inteligência pública verificável</span>
          </div>
        </Link>

        <nav className="topnav" aria-label="Principal">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="topnav-link">
              {link.label}
            </Link>
          ))}
        </nav>
        <AdminModeToggle />
      </div>
    </header>
  );
}
