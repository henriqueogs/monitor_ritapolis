import Link from 'next/link';

function Chip({ href, ativo, children }) {
  return (
    <Link
      href={href}
      style={{
        padding: '5px 14px', borderRadius: 16, fontSize: 13, fontWeight: 600, textDecoration: 'none',
        background: ativo ? 'var(--accent)' : 'var(--surface-muted)',
        color: ativo ? '#fff' : 'inherit',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </Link>
  );
}

function labelMandato(m, emCurso) {
  const base = `Mandato ${m.inicio}–${m.fim}`;
  if (emCurso) {return `${base} (em curso)`;}
  const esperados = m.fim - m.inicio + 1;
  if (m.anos.length < esperados) {return `${base} (dados de ${m.anos[0]}–${m.anos[m.anos.length - 1]})`;}
  return base;
}

/**
 * Seletor de período reutilizável: mandatos como visão agregada, anos como
 * filtro fino, "Todos" como agregado completo. Sem query = mandato em curso.
 *
 * @param {string} basePath — rota alvo dos chips (ex: '/transparencia')
 * @param {object} extraParams — query params a preservar (ex: { categoria: 'diarias' })
 */
export default function PeriodoSelector({ porMandato, periodo, anosCobertos, modo, basePath = '/transparencia', extraParams = {} }) {
  const mandatos = porMandato || [];
  const anos = mandatos.flatMap((m) => m.anos).sort((a, b) => b - a);
  const labelTodos = anosCobertos?.length ? `Todos (${anosCobertos[0]}–${anosCobertos[1]})` : 'Todos';

  const href = (params) => {
    const query = new URLSearchParams({ ...extraParams, ...params }).toString();
    return query ? `${basePath}?${query}` : basePath;
  };

  return (
    <nav aria-label="Período" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 24 }}>
      <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        Período:
      </span>
      {mandatos.map((m) => (
        <Chip
          key={m.mandato}
          href={m.em_curso ? href({}) : href({ mandato: m.inicio })}
          ativo={modo === 'mandato' && periodo?.mandato?.inicio === m.inicio}
        >
          {labelMandato(m, m.em_curso)}
        </Chip>
      ))}
      {anos.map((ano) => (
        <Chip key={ano} href={href({ exercicio: ano })} ativo={modo === 'exercicio' && periodo?.exercicio === ano}>
          {ano}
        </Chip>
      ))}
      <Chip href={href({ periodo: 'todos' })} ativo={modo === 'todos'}>
        {labelTodos}
      </Chip>
    </nav>
  );
}
