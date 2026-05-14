import Link from 'next/link';
import { buildPathWithQuery } from '../lib/navigation';

function pageWindow(current, totalPages) {
  const start = Math.max(1, current - 2);
  const end = Math.min(totalPages, current + 2);
  const pages = [];

  for (let page = start; page <= end; page += 1) {
    pages.push(page);
  }

  return pages;
}

export default function Pagination({ basePath, filters, total, pagina, limite }) {
  const current = Math.max(Number(pagina || 1), 1);
  const pageSize = Math.max(Number(limite || 20), 1);
  const totalPages = Math.max(Math.ceil(Number(total || 0) / pageSize), 1);

  if (totalPages <= 1) return null;

  const firstItem = (current - 1) * pageSize + 1;
  const lastItem = Math.min(current * pageSize, total);

  function href(page) {
    return buildPathWithQuery(basePath, {
      ...filters,
      pagina: page > 1 ? page : undefined,
      limite: pageSize
    });
  }

  return (
    <nav className="pagination" aria-label="Paginacao">
      <p>
        Mostrando {firstItem}-{lastItem} de {total}
      </p>
      <div className="pagination-links">
        {current > 1 ? (
          <Link href={href(current - 1)} className="pagination-link">
            Anterior
          </Link>
        ) : (
          <span className="pagination-link is-disabled">Anterior</span>
        )}

        {pageWindow(current, totalPages).map((page) => (
          <Link
            key={page}
            href={href(page)}
            className={page === current ? 'pagination-link is-active' : 'pagination-link'}
          >
            {page}
          </Link>
        ))}

        {current < totalPages ? (
          <Link href={href(current + 1)} className="pagination-link">
            Proxima
          </Link>
        ) : (
          <span className="pagination-link is-disabled">Proxima</span>
        )}
      </div>
    </nav>
  );
}
