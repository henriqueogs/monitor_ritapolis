'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, Menu, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { AREAS, FERRAMENTAS } from '../lib/modulos';

// Nav enxuta gerada do mapa único (lib/modulos.js): cada área vira dropdown
// com os módulos dela, igual à home e às páginas de área.
const links = [
  { href: '/', label: 'Início', exact: true },
  ...AREAS.map((area) => ({
    href: area.href,
    label: area.titulo,
    children: area.grupos.flatMap((g) => g.modulos.map((m) => ({ href: m.href, label: m.titulo }))),
  })),
  { href: '/na-lupa', label: 'Na Lupa' },
  {
    href: '/acervo',
    label: 'Ferramentas',
    children: FERRAMENTAS.filter((f) => f.href !== '/na-lupa').map((f) => ({ href: f.href, label: f.titulo })),
  },
];

function isLinkActive(link, pathname) {
  if (link.exact) return pathname === link.href;
  if (link.children?.some((child) => pathname.startsWith(child.href))) return true;
  return pathname.startsWith(link.href);
}

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
          const isActive = isLinkActive(link, pathname);
          if (!link.children) {
            return (
              <Link
                key={link.href}
                href={link.href}
                prefetch={false}
                className={`topnav-link${isActive ? ' is-active' : ''}`}
              >
                {link.label}
              </Link>
            );
          }
          return (
            <div key={link.href} className="topnav-group">
              <Link
                href={link.href}
                prefetch={false}
                className={`topnav-link topnav-group-trigger${isActive ? ' is-active' : ''}`}
              >
                {link.label}
                <ChevronDown size={14} aria-hidden="true" />
              </Link>
              <div className="topnav-dropdown">
                {link.children.map((child) => (
                  <Link
                    key={child.href}
                    href={child.href}
                    prefetch={false}
                    className={`topnav-dropdown-link${pathname.startsWith(child.href) ? ' is-active' : ''}`}
                  >
                    {child.label}
                  </Link>
                ))}
              </div>
            </div>
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
            const isActive = isLinkActive(link, pathname);
            return (
              <div key={link.href}>
                <Link
                  href={link.href}
                  prefetch={false}
                  className={`mobile-nav-link${isActive ? ' is-active' : ''}`}
                  onClick={() => setOpen(false)}
                >
                  {link.label}
                </Link>
                {link.children?.map((child) => (
                  <Link
                    key={child.href}
                    href={child.href}
                    prefetch={false}
                    className={`mobile-nav-link mobile-nav-sublink${pathname.startsWith(child.href) ? ' is-active' : ''}`}
                    onClick={() => setOpen(false)}
                  >
                    {child.label}
                  </Link>
                ))}
              </div>
            );
          })}
        </nav>
      )}
    </>
  );
}
