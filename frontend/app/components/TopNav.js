import Link from 'next/link';
import BrandMark from './BrandMark';
import AuthControl from './AuthControl';
import NavLinks from './NavLinks';
import { BRAND_TAGLINE } from '../lib/brand';

export default function TopNav() {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link href="/" className="brand">
          <div className="brand-icon">
            <BrandMark size={18} />
          </div>
          <div className="brand-text">
            <strong>ritápolis.com</strong>
            <span>{BRAND_TAGLINE}</span>
          </div>
        </Link>

        <NavLinks />

        <AuthControl />
      </div>
    </header>
  );
}
