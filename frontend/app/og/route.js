import { ImageResponse } from 'next/og';
import { BRAND } from '../lib/brand';
import { PUBLIC_PAGES } from '../../lib/page-metadata';

// Cartão social por página pública (título da página sobre o azul da marca).
// Só caminhos de PUBLIC_PAGES: qualquer outro valor cai na home (sem texto livre na URL).
export const runtime = 'nodejs';

const BRAND_BLUE = '#1b3af0';
const SIZE = { width: 1200, height: 630 };
const CACHE = 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400';

export async function GET(request) {
  const path = new URL(request.url).searchParams.get('path');
  const page = PUBLIC_PAGES[path] || PUBLIC_PAGES['/'];

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: 80,
          background: BRAND_BLUE,
          color: '#ffffff',
        }}
      >
        <div style={{ display: 'flex', fontSize: 40, opacity: 0.85 }}>{BRAND}</div>
        <div style={{ display: 'flex', fontSize: 76, fontWeight: 700, marginTop: 24, lineHeight: 1.1 }}>
          {page.title}
        </div>
        <div style={{ display: 'flex', fontSize: 30, opacity: 0.85, marginTop: 28 }}>
          Dados públicos com link para a fonte oficial
        </div>
      </div>
    ),
    { ...SIZE, headers: { 'Cache-Control': CACHE } }
  );
}
