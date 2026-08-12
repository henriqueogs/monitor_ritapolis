import Link from 'next/link';
import Image from 'next/image';
import AuthControl from './AuthControl';
import NavLinks from './NavLinks';
import brandLogo from '../ritapolis-logo.png';

export default function TopNav() {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link href="/" className="brand" aria-label="ritápolis.com — página inicial">
          <span className="brand-logo-frame">
            <Image
              src={brandLogo}
              alt="ritápolis.com"
              className="brand-logo"
              fill
              priority
              sizes="(max-width: 640px) 148px, 190px"
            />
          </span>
        </Link>

        <NavLinks />

        <AuthControl />
      </div>
    </header>
  );
}
