import Link from 'next/link';
import { fetchTransparenciaDespesas } from '../../lib/api';
import SectionBlock from '../../components/SectionBlock';
import TabelaEmpenhos from '../../components/TabelaEmpenhos';
import FilterBar from '../../components/FilterBar';
import TransparenciaSubnav from '../../components/TransparenciaSubnav';
import { FINALIDADE_OPCOES } from '../../lib/finalidades';

export const metadata = {
  title: 'Empenhos — Dinheiro público',
  description: 'Lista completa de empenhos da Prefeitura de Ritápolis, com busca e filtros por categoria e ano.',
};

const LIMITE = 25;
const ANO_MIN = 2022;
const FINALIDADES = FINALIDADE_OPCOES;

export default async function EmpenhosPage({ searchParams: searchParamsPromise }) {
  const searchParams = await searchParamsPromise;
  const q = searchParams?.q || '';
  const categoria = searchParams?.categoria || '';
  const finalidade = searchParams?.finalidade || '';
  const exercicio = searchParams?.exercicio ? Number(searchParams.exercicio) : undefined;
  const mandato = !exercicio && searchParams?.mandato ? Number(searchParams.mandato) : undefined;
  const periodoTodos = !exercicio && !mandato && searchParams?.periodo === 'todos';
  const pagina = searchParams?.pagina ? Number(searchParams.pagina) : 1;

  const resultado = await fetchTransparenciaDespesas({
    q: q || undefined,
    categoria: categoria || undefined,
    finalidade: finalidade || undefined,
    exercicio,
    mandato,
    pagina,
    limite: LIMITE,
  });
  const dados = resultado?.dados || [];
  const total = resultado?.total || 0;
  const totalPaginas = Math.max(1, Math.ceil(total / LIMITE));
  const anoAtual = new Date().getFullYear();
  const periodoParams = {
    ...(exercicio ? { exercicio: String(exercicio) } : {}),
    ...(mandato ? { mandato: String(mandato) } : {}),
    ...(periodoTodos ? { periodo: 'todos' } : {}),
  };
  const periodoTitulo = exercicio
    ? String(exercicio)
    : mandato
      ? `mandato ${mandato}-${mandato + 3}`
      : 'todos os anos coletados';

  const href = (params) =>
    `/transparencia/empenhos?${new URLSearchParams({
      ...(q ? { q } : {}),
      ...(categoria ? { categoria } : {}),
      ...(finalidade ? { finalidade } : {}),
      ...periodoParams,
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

      <TransparenciaSubnav />

      {/* Filtros */}
      <FilterBar action="/transparencia/empenhos">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Buscar na descrição ou credor…"
          className="field-input"
          style={{ flex: '1 1 240px', minWidth: 0 }}
        />
        {categoria && <input type="hidden" name="categoria" value={categoria} />}
        {mandato && <input type="hidden" name="mandato" value={mandato} />}
        {periodoTodos && <input type="hidden" name="periodo" value="todos" />}
        <select name="finalidade" defaultValue={finalidade} className="field-select" style={{ width: 'auto' }}>
          <option value="">Todas as finalidades</option>
          {FINALIDADES.map((item) => (
            <option key={item.value} value={item.value}>{item.label}</option>
          ))}
        </select>
        <select name="exercicio" defaultValue={exercicio || ''} className="field-select" style={{ width: 'auto' }}>
          <option value="">Todos os anos</option>
          {Array.from({ length: anoAtual - ANO_MIN + 1 }, (_, i) => anoAtual - i).map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </FilterBar>

      <SectionBlock
        title={`${total.toLocaleString('pt-BR')} empenho${total !== 1 ? 's' : ''} encontrado${total !== 1 ? 's' : ''} (${periodoTitulo})`}
        description={categoria || finalidade ? (
          <>
            {categoria ? <>Categoria: <strong>{categoria}</strong>. </> : null}
            {finalidade ? <>Finalidade: <strong>{FINALIDADES.find((item) => item.value === finalidade)?.label || finalidade}</strong>. </> : null}
            <Link href="/transparencia/empenhos">Limpar filtros</Link>
          </>
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
