'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/legislacao/camara/projetos', label: 'Projetos em tramitação', match: (path) => path.startsWith('/legislacao/camara/projetos') },
  { href: '/legislacao/camara/vereadores', label: 'Vereadores', match: (path) => path.startsWith('/legislacao/camara/vereadores') },
];

export default function CamaraSubnav() {
  const pathname = usePathname() || '';

  return (
    <nav
      aria-label="Navegacao da Camara Municipal"
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
            prefetch={false}
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
