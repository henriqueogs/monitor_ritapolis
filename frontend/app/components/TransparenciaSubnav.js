'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/transparencia', label: 'Visao geral', match: (path) => path === '/transparencia' || path.startsWith('/transparencia/categoria') },
  { href: '/transparencia/finalidades', label: 'Finalidades', match: (path) => path.startsWith('/transparencia/finalidades') || path.startsWith('/finalidade') },
  { href: '/credores', label: 'Credores', match: (path) => path.startsWith('/credores') },
  { href: '/transparencia/empenhos', label: 'Empenhos', match: (path) => path.startsWith('/transparencia/empenhos') || path.startsWith('/empenho') },
];

export default function TransparenciaSubnav() {
  const pathname = usePathname() || '';

  return (
    <nav
      aria-label="Navegacao de dinheiro publico"
      style={{
        display: 'flex',
        gap: 8,
        flexWrap: 'wrap',
        alignItems: 'center',
        margin: '0 0 20px',
        paddingBottom: 4,
      }}
    >
      {links.map((link) => {
        const active = link.match(pathname);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? 'page' : undefined}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              minHeight: 34,
              padding: '7px 12px',
              borderRadius: 'var(--radius-pill)',
              border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
              background: active ? 'var(--accent-soft)' : 'var(--surface)',
              color: active ? 'var(--accent)' : 'var(--text-secondary)',
              fontSize: 13,
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
