import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import AdminModeToggle from './AdminModeToggle';
import NavLinks from './NavLinks';

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

        <NavLinks />

        {/* Form HTML puro: funciona sem JS e mantém o TopNav server component */}
        <form action="/busca" method="get" className="topbar-search" role="search">
          <input
            type="search"
            name="q"
            placeholder="Buscar nome, empresa, empenho…"
            aria-label="Buscar em documentos, empenhos e fornecedores"
            minLength={2}
          />
        </form>

        <AdminModeToggle />
      </div>
    </header>
  );
}
