import Link from 'next/link';
import { replaceFilter } from '../../lib/navigation';

export default function LicitacaoYearNav({ anos, filters, currentYear }) {
  if (!anos.length) return null;

  const preservedFilters = {
    q: filters.q,
    fonte: filters.fonte,
    ano: filters.ano,
    status: filters.status,
    categoria: filters.categoria
  };

  return (
    <nav className="year-filter" aria-label="Filtrar licitacoes por ano">
      {anos.slice(0, 14).map((item) => {
        const isActive = String(item.ano) === String(filters.ano);
        const label = Number(item.ano) === currentYear ? `${item.ano} atual` : item.ano;

        return (
          <Link
            key={item.ano}
            href={replaceFilter('/licitacoes', preservedFilters, 'ano', item.ano)}
            className={isActive ? 'year-filter-link is-active' : 'year-filter-link'}
          >
            {label}
            <span>{item.total}</span>
          </Link>
        );
      })}
    </nav>
  );
}
