import Link from 'next/link';
import { fetchTransparenciaDespesas } from '../../lib/api';
import SectionBlock from '../../components/SectionBlock';
import TabelaEmpenhos from '../../components/TabelaEmpenhos';
import SearchInput from '../../components/SearchInput';

export const metadata = {
  title: 'Empenhos — Dinheiro público — Monitor Ritápolis',
  description: 'Lista completa de empenhos da Prefeitura de Ritápolis, com busca e filtros por categoria e ano.',
};

const LIMITE = 25;
const ANO_MIN = 2022;

export default async function EmpenhosPage({ searchParams }) {
  const q = searchParams?.q || '';
  const categoria = searchParams?.categoria || '';
  const exercicio = searchParams?.exercicio ? Number(searchParams.exercicio) : undefined;
  const pagina = searchParams?.pagina ? Number(searchParams.pagina) : 1;

  const resultado = await fetchTransparenciaDespesas({
    q: q || undefined,
    categoria: categoria || undefined,
    exercicio,
    pagina,
    limite: LIMITE,
  });
  const dados = resultado?.dados || [];
  const total = resultado?.total || 0;
  const totalPaginas = Math.max(1, Math.ceil(total / LIMITE));
  const anoAtual = new Date().getFullYear();

  const href = (params) =>
    `/transparencia/empenhos?${new URLSearchParams({
      ...(q ? { q } : {}),
      ...(categoria ? { categoria } : {}),
      ...(exercicio ? { exercicio: String(exercicio) } : {}),
      ...params,
    })}`;

  return (
    <main className="page-container">
      <div className="page-hero">
        <p style={{ margin: '0 0 6px', fontSize: 13 }}>
          <Link href="/transparencia" style={{ color: 'var(--text-muted)' }}>← Dinheiro público</Link>
        </p>
        <h1>Empenhos</h1>
        <p className="page-hero-sub">
          Cada gasto registrado no Portal da Transparência da Prefeitura, com link pro detalhamento oficial.
        </p>
      </div>

      {/* Filtros */}
      <form method="get" action="/transparencia/empenhos" style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <SearchInput name="q" defaultValue={q} placeholder="Buscar na descrição ou credor…" />
        {categoria && <input type="hidden" name="categoria" value={categoria} />}
        <select
          name="exercicio"
          defaultValue={exercicio || ''}
          style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 14, background: 'var(--surface)' }}
        >
          <option value="">Todos os anos</option>
          {Array.from({ length: anoAtual - ANO_MIN + 1 }, (_, i) => anoAtual - i).map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </form>

      <SectionBlock
        title={`${total.toLocaleString('pt-BR')} empenho${total !== 1 ? 's' : ''} encontrado${total !== 1 ? 's' : ''}${exercicio ? ` (${exercicio})` : ' (todos os anos coletados)'}`}
        description={categoria ? (
          <>Filtrando pela categoria <strong>{categoria}</strong>. <Link href="/transparencia/empenhos">Limpar filtro</Link></>
        ) : undefined}
      >
        <TabelaEmpenhos dados={dados} mostrarCredor />

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
