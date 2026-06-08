import Link from 'next/link';
import { replaceFilter } from '../../lib/navigation';

export default function YearFilter({ anos, filters, basePath = '/acervo' }) {
  if (!anos.length) return null;

  const preservedFilters = {
    q: filters.q,
    fonte: filters.fonte,
    tipo: filters.tipo,
    ano: filters.ano,
    status: filters.status,
    qualidade: filters.qualidade
  };

  return (
    <nav className="year-filter" aria-label="Filtrar por ano">
      <Link
        href={replaceFilter(basePath, preservedFilters, 'ano', '')}
        className={!filters.ano ? 'year-filter-link is-active' : 'year-filter-link'}
      >
        Todos
      </Link>
      {anos.slice(0, 12).map((item) => (
        <Link
          key={item.ano}
          href={replaceFilter(basePath, preservedFilters, 'ano', item.ano)}
          className={String(item.ano) === filters.ano ? 'year-filter-link is-active' : 'year-filter-link'}
        >
          {item.ano}
          <span>{item.total}</span>
        </Link>
      ))}
    </nav>
  );
}
