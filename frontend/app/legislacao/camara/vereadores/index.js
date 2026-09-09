import Link from 'next/link';
import { fetchCamaraVereadores } from '../../../lib/api';
import SectionBlock from '../../../components/SectionBlock';
import CamaraSubnav from '../../../components/CamaraSubnav';

export const metadata = {
  title: 'Vereadores — Câmara Municipal',
  description: 'Vereadores em mandato na Câmara Municipal de Ritápolis/MG, com partido e período.',
};

export default async function VereadoresPage() {
  const vereadores = await fetchCamaraVereadores();

  return (
    <main className="page-container">
      <div className="page-title">
        <p style={{ margin: '0 0 6px', fontSize: 13 }}>
          <Link href="/legislacao" style={{ color: 'var(--text-muted)' }}>← Legislação Municipal</Link>
        </p>
        <h1>Vereadores</h1>
        <p>Composição atual da Câmara Municipal, com partido e período do mandato mais recente.</p>
      </div>

      <CamaraSubnav />

      <SectionBlock
        title={`${vereadores.length} vereador${vereadores.length !== 1 ? 'es' : ''}`}
        description="Dado direto do sistema institucional da Câmara (SGC)."
      >
        {vereadores.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>Nenhum vereador encontrado.</p>
        ) : (
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
            {vereadores.map((v) => (
              <Link
                key={v.int_pes}
                href={`/legislacao/camara/vereadores/${v.int_pes}`}
                className="admin-metric-card"
                style={{ color: 'inherit', textDecoration: 'none' }}
              >
                <strong style={{ fontSize: 15 }}>{v.nome}</strong>
                <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                  {v.partido_atual || 'Partido não informado'}
                  {v.mandato_fim ? ` · mandato até ${v.mandato_fim}` : ''}
                </span>
              </Link>
            ))}
          </div>
        )}
      </SectionBlock>
    </main>
  );
}
