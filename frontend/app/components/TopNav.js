import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import AuthControl from './AuthControl';
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

        <AuthControl />
      </div>
    </header>
  );
}
