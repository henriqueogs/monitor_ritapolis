import Link from 'next/link';
import { fetchCamaraProjetos } from '../../../lib/api';
import SectionBlock from '../../../components/SectionBlock';
import TabelaProjetos from '../../../components/TabelaProjetos';
import CamaraSubnav from '../../../components/CamaraSubnav';
import ProjetosFilters from '../components/ProjetosFilters';

export const metadata = {
  title: 'Projetos em tramitação — Câmara Municipal',
  description: 'Projetos de lei, resolução e emenda em tramitação na Câmara Municipal de Ritápolis/MG.',
};

const LIMITE = 30;

export default async function ProjetosPage({ searchParams: searchParamsPromise }) {
  const searchParams = await searchParamsPromise;
  const tipo = searchParams?.tipo || '';
  const exercicio = searchParams?.exercicio || '';
  const pagina = searchParams?.pagina ? Number(searchParams.pagina) : 1;

  const resultado = await fetchCamaraProjetos({
    tipo: tipo || undefined,
    exercicio: exercicio || undefined,
    pagina,
    limite: LIMITE,
  });
  const dados = resultado?.dados || [];
  const total = resultado?.total || 0;
  const totalPaginas = Math.max(1, Math.ceil(total / LIMITE));

  const href = (params) =>
    `/legislacao/camara/projetos?${new URLSearchParams({
      ...(tipo ? { tipo } : {}),
      ...(exercicio ? { exercicio } : {}),
      ...params,
    })}`;

  return (
    <main className="page-container">
      <div className="page-title">
        <p style={{ margin: '0 0 6px', fontSize: 13 }}>
          <Link href="/legislacao" style={{ color: 'var(--text-muted)' }}>← Legislação Municipal</Link>
        </p>
        <h1>Projetos em tramitação</h1>
        <p>
          Projetos de lei, resolução e emenda em andamento na Câmara Municipal — dado bruto da fonte
          oficial (SGC), sem votação registrada digitalmente até o momento.
        </p>
      </div>

      <CamaraSubnav />

      <ProjetosFilters filters={{ tipo, exercicio }} />

      <SectionBlock
        title={`${total.toLocaleString('pt-BR')} projeto${total !== 1 ? 's' : ''} encontrado${total !== 1 ? 's' : ''}`}
        description="Cada item aponta pro PDF oficial do projeto, quando disponível."
      >
        <TabelaProjetos dados={dados} />

        {total > LIMITE && (
          <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'center' }}>
            {pagina > 1 && (
              <Link href={href({ pagina: String(pagina - 1) })} style={{ padding: '6px 16px', borderRadius: 6, background: 'var(--surface-muted)', fontSize: 13 }}>
                ← Anterior
              </Link>
            )}
            <span style={{ padding: '6px 12px', fontSize: 13, color: 'var(--text-muted)' }}>
              Pág. {pagina} de {totalPaginas}
            </span>
            {pagina < totalPaginas && (
              <Link href={href({ pagina: String(pagina + 1) })} style={{ padding: '6px 16px', borderRadius: 6, background: 'var(--surface-muted)', fontSize: 13 }}>
                Próxima →
              </Link>
            )}
          </div>
        )}
      </SectionBlock>
    </main>
  );
}
