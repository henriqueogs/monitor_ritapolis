import { ImageResponse } from 'next/og';
import { BRAND, BRAND_TAGLINE } from './lib/brand';

// Cartão social 1200x630 gerado no build (sem dependência externa nem PNG solto).
// Mesmo glifo do favicon/navbar sobre o azul da marca.
export const runtime = 'edge';
export const alt = `${BRAND} — ${BRAND_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const BRAND_BLUE = '#1b3af0';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: BRAND_BLUE,
          color: '#ffffff',
        }}
      >
        <svg width="180" height="180" viewBox="0 0 64 64" fill="#ffffff">
          <path d="M20 15c-4 2 -6 6 -6 11c0 3 -1 4 -3 6c-1 1 -1 2 1 2l3 0l0 4c0 5 3 9 8 10l0 -33c0 -6 -1 -11 -3 -11z" />
          <rect x="30" y="30" width="4" height="19" rx="1" />
          <rect x="37" y="22" width="4" height="27" rx="1" />
          <rect x="44" y="34" width="4" height="15" rx="1" />
        </svg>
        <div style={{ display: 'flex', fontSize: 84, fontWeight: 700, marginTop: 28, letterSpacing: -2 }}>
          {BRAND}
        </div>
        <div style={{ display: 'flex', fontSize: 34, opacity: 0.85, marginTop: 10 }}>
          {BRAND_TAGLINE}
        </div>
      </div>
    ),
    size
  );
}
