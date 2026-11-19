import Link from 'next/link';
import { fetchCamaraVereadores } from '../../../lib/api';
import SectionBlock from '../../../components/SectionBlock';
import CamaraSubnav from '../../../components/CamaraSubnav';

export const metadata = {
  title: 'Vereadores — Câmara Municipal',
  description: 'Vereadores de Ritápolis/MG: mandato, partido e o que cada um pediu ao Executivo.',
};

function Cartao({ v }) {
  // Um número por mandato, nunca somados.
  const porMandato = v.proposicoes_por_mandato || [];
  return (
    <Link
      href={`/legislacao/camara/vereadores/${v.slug}`}
      className="admin-metric-card"
      style={{ color: 'inherit', textDecoration: 'none' }}
    >
      <strong style={{ fontSize: 15 }}>{v.nome}</strong>
      {v.partido_atual && (
        <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
          {v.partido_atual} · mandato até {v.mandato_fim}
        </span>
      )}
      <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
        {porMandato.length > 0
          ? porMandato
              .map((m) => `${m.total} indicações e requerimentos (mandato ${m.inicio}–${m.fim})`)
              .join(' · ')
          : 'Sem indicação ou requerimento publicado'}
      </span>
    </Link>
  );
}

function Grade({ pessoas }) {
  return (
    <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
      {pessoas.map((v) => <Cartao key={v.slug} v={v} />)}
    </div>
  );
}

export default async function VereadoresPage() {
  const pessoas = await fetchCamaraVereadores();
  const cadastro = pessoas.filter((v) => v.int_pes);
  const soAutores = pessoas.filter((v) => !v.int_pes);

  return (
    <main className="page-container">
      <div className="page-title">
        <p style={{ margin: '0 0 6px', fontSize: 13 }}>
          <Link href="/legislacao" style={{ color: 'var(--text-muted)' }}>← Legislação Municipal</Link>
        </p>
        <h1>Vereadores</h1>
        <p>Quem está no cadastro da Câmara e quem assinou indicações e requerimentos.</p>
      </div>

      <CamaraSubnav />

      {pessoas.length === 0 && <p style={{ color: 'var(--text-muted)' }}>Nenhum vereador encontrado.</p>}

      {cadastro.length > 0 && (
        <SectionBlock
          title="No cadastro da Câmara"
          description="Nomes, partidos e mandatos como constam no sistema da Câmara (SGC). O cadastro oficial não lista todos os vereadores."
        >
          <Grade pessoas={cadastro} />
        </SectionBlock>
      )}

      {soAutores.length > 0 && (
        <SectionBlock
          title="Fora do cadastro da Câmara"
          description="Nomes que assinam proposições ou constam nas atas das sessões, mas não estão no cadastro oficial. Partido e mandato não informados pela fonte."
        >
          <Grade pessoas={soAutores} />
        </SectionBlock>
      )}
    </main>
  );
}
