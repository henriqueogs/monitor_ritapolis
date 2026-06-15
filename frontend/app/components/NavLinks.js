'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { useState, useEffect } from 'react';

const links = [
  { href: '/', label: 'Início', exact: true },
  { href: '/licitacoes', label: 'Licitações' },
  { href: '/credores', label: 'Fornecedores' },
  { href: '/transparencia', label: 'Dinheiro público' },
  { href: '/acervo', label: 'Acervo' },
  { href: '/sobre', label: 'Sobre' },
];

export default function NavLinks() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Fecha ao mudar de rota
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      <nav className="topnav" aria-label="Principal">
        {links.map((link) => {
          const isActive = link.exact ? pathname === link.href : pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`topnav-link${isActive ? ' is-active' : ''}`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>

      <button
        className="mobile-nav-toggle"
        aria-label={open ? 'Fechar menu' : 'Abrir menu'}
        aria-expanded={open}
        aria-controls="mobile-nav"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <X size={20} /> : <Menu size={20} />}
      </button>

      {open && (
        <nav id="mobile-nav" className="mobile-nav" aria-label="Principal">
          {links.map((link) => {
            const isActive = link.exact ? pathname === link.href : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`mobile-nav-link${isActive ? ' is-active' : ''}`}
                onClick={() => setOpen(false)}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      )}
    </>
  );
}
