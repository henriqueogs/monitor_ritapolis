import Link from 'next/link';
import { Archive, Info, Search, Users } from 'lucide-react';
import styles from '../styles.module.css';

const LINKS = [
  { href: '/na-lupa', label: 'Na Lupa', icon: Search },
  { href: '/credores', label: 'Credores', icon: Users },
  { href: '/acervo', label: 'Acervo completo', icon: Archive },
  { href: '/sobre', label: 'Sobre / Metodologia', icon: Info },
];

// Faixa de acesso direto pra paginas que nao cabem em nenhum dos dois hubs
// (cross-cutting ou institucional) -- fica so' na home, fora do dropdown do
// menu principal.
export default function HomeQuickLinks() {
  return (
    <div className={styles.quickLinks}>
      {LINKS.map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} prefetch={false} className={styles.quickLink}>
          <Icon size={16} />
          {label}
        </Link>
      ))}
    </div>
  );
}
