import Link from 'next/link';
import { fetchCamaraVereadorDossie } from '../../../../lib/api';
import SectionBlock from '../../../../components/SectionBlock';
import CamaraSubnav from '../../../../components/CamaraSubnav';
import BreadcrumbJsonLd from '../../../../components/BreadcrumbJsonLd';

export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params: paramsPromise }) {
  const params = await paramsPromise;
  const vereador = await fetchCamaraVereadorDossie(params.int_pes);
  return { title: vereador ? `${vereador.nome} — Vereador` : 'Vereador não encontrado' };
}

export default async function VereadorDossiePage({ params: paramsPromise }) {
  const params = await paramsPromise;
  const vereador = await fetchCamaraVereadorDossie(params.int_pes);

  if (!vereador) {
    return (
      <main className="page-container">
        <div className="page-title">
          <Link href="/legislacao/camara/vereadores" style={{ color: 'var(--text-muted)', fontSize: 13 }}>← Vereadores</Link>
          <h1>Vereador não encontrado</h1>
          <p>Este vereador não existe na base coletada da Câmara Municipal.</p>
        </div>
      </main>
    );
  }

  const mandatos = vereador.mandatos || [];
  const atual = mandatos[0];

  return (
    <main className="page-container">
      <BreadcrumbJsonLd
        items={[
          { name: 'Legislação Municipal', url: '/legislacao' },
          { name: 'Vereadores', url: '/legislacao/camara/vereadores' },
          { name: vereador.nome, url: `/legislacao/camara/vereadores/${vereador.int_pes}` },
        ]}
      />
      <div className="page-title">
        <p style={{ margin: '0 0 6px', fontSize: 13, color: 'var(--text-muted)' }}>
          <Link href="/legislacao/camara/vereadores" style={{ color: 'var(--text-muted)' }}>← Vereadores</Link>
        </p>
        <h1>{vereador.nome}</h1>
        {atual && (
          <p style={{ margin: '4px 0 0' }}>
            <span className="availability-badge is-real">{atual.partido}</span>
            <span style={{ fontSize: 13, color: 'var(--text-muted)', marginLeft: 8 }}>
              mandato {atual.periodo_inicio}–{atual.periodo_fim}
            </span>
          </p>
        )}
      </div>

      <CamaraSubnav />

      <SectionBlock
        title="Mandatos"
        description="Histórico de mandatos e partidos, do mais recente ao mais antigo."
      >
        {mandatos.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>Nenhum mandato registrado.</p>
        ) : (
          <div className="table-scroll-x">
            <div className="simple-table" style={{ minWidth: 400 }}>
              <div className="table-row table-row-header" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <span>Período</span>
                <span>Partido</span>
              </div>
              {mandatos.map((m) => (
                <div key={m.periodo_inicio} className="table-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: '8px 0' }}>
                  <span style={{ fontSize: 13 }}>{m.periodo_inicio}–{m.periodo_fim}</span>
                  <span style={{ fontSize: 13 }}>{m.partido || '—'}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </SectionBlock>
    </main>
  );
}
