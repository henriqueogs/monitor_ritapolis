import Link from 'next/link';
import LogoutButton from './LogoutButton';

const adminLinks = [
  { href: '/admin', label: 'Visao geral' },
  { href: '/admin/jobs', label: 'Jobs & Schedulers' },
  { href: '/admin/alertas', label: 'Descobertas' },
  { href: '/admin/ia', label: 'IA' },
  { href: '/admin/coletas', label: 'Coletas' },
  { href: '/admin/cobertura', label: 'Cobertura' },
  { href: '/admin/qualidade', label: 'Qualidade' }
];

export default function AdminLayout({ children }) {
  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-title">
          <strong>Operacao</strong>
          <span>Ritápolis.com</span>
        </div>
        <nav aria-label="Administracao">
          {adminLinks.map((link) => (
            <Link key={link.href} href={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>
        <LogoutButton />
      </aside>
      <div className="admin-content">
        {children}
      </div>
    </div>
  );
}
