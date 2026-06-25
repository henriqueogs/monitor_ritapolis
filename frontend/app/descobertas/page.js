import Link from 'next/link';
import { fetchAlertas } from '../lib/api';
import { formatMoney, formatDate } from '../lib/format';
import { nivelLabel } from '../lib/descobertas';
import styles from './styles.module.css';

export const metadata = {
  title: 'Descobertas — Monitor Ritápolis',
  description: 'Curiosidades e padrões encontrados nos documentos públicos de Ritápolis/MG.',
};

const FILTROS = [
  { href: '/descobertas', label: 'Todas' },
  { href: '/descobertas?severidade=critico', label: 'Merece atenção', nivel: 'critico' },
  { href: '/descobertas?severidade=atencao', label: 'Vale conferir', nivel: 'atencao' },
  { href: '/descobertas?severidade=info', label: 'Curiosidades', nivel: 'info' },
  { href: '/descobertas?tipo=tematico', label: 'Padrões' },
  { href: '/descobertas?tipo=processo', label: 'Por processo' },
];

function IconDoc() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M8 13h8M8 17h6" />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

function chipAtivo(filtro, params) {
  if (filtro.nivel) {
    return params.severidade === filtro.nivel;
  }
  if (filtro.href.includes('tipo=tematico')) {
    return params.tipo === 'tematico';
  }
  if (filtro.href.includes('tipo=processo')) {
    return params.tipo === 'processo';
  }
  return !params.severidade && !params.tipo;
}

export default async function DescobertasPage({ searchParams }) {
  const params = searchParams || {};
  const resultado = await fetchAlertas({
    tipo: params.tipo || undefined,
    categoria: params.categoria || undefined,
    severidade: params.severidade || undefined,
    status: params.status || 'ativo',
    pagina: params.pagina || 1,
    limite: params.limite || 30,
  }).catch(() => ({ total: 0, dados: [], pagina: 1, limite: 30 }));

  const alertas = resultado.dados || [];

  return (
    <main className={styles.container}>
      <header className={styles.header}>
        <span className={styles.eyebrow}>Monitor Ritápolis</span>
        <h1 className={styles.title}>Descobertas nos dados</h1>
        <p className={styles.subtitle}>
          Curiosidades e padrões que a análise encontrou nos documentos públicos. São pontos para
          explorar e entender — a maioria é perfeitamente normal. O objetivo é dar visibilidade, não
          alarmar.
        </p>
      </header>

      <nav className={styles.filters} aria-label="Filtrar descobertas">
        {FILTROS.map((f) => {
          const ativo = chipAtivo(f, params);
          return (
            <Link
              key={f.href}
              href={f.href}
              className={`${styles.chip} ${ativo ? styles.chipActive : ''}`}
              aria-current={ativo ? 'page' : undefined}
            >
              {f.nivel ? <span className={styles.chipDot} data-nivel={f.nivel} /> : null}
              {f.label}
            </Link>
          );
        })}
      </nav>

      {alertas.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>Nenhuma descoberta por aqui</p>
          <p>Nenhum padrão corresponde a este filtro no momento.</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {alertas.map((alerta) => (
            <Link
              key={alerta.id}
              href={`/descobertas/${alerta.id}`}
              className={styles.card}
              data-nivel={alerta.severidade || 'info'}
            >
              <div className={styles.cardTop}>
                <span className={styles.nivel}>
                  <span className={styles.nivelDot} />
                  {nivelLabel(alerta.severidade)}
                </span>
                <span className={styles.tag}>{alerta.categoria || 'Geral'}</span>
                <span className={styles.tagSep}>•</span>
                <span className={styles.tag}>{alerta.tipo === 'processo' ? 'por processo' : 'padrão'}</span>
              </div>

              <h2 className={styles.cardTitle}>{alerta.titulo}</h2>

              {alerta.narrativa ? (
                <p className={styles.cardSummary}>{alerta.narrativa}</p>
              ) : null}

              <div className={styles.cardFooter}>
                {alerta.valor_total ? (
                  <span className={styles.value}>
                    {formatMoney(alerta.valor_total)}
                    {alerta.valor_periodo_label ? (
                      <span className={styles.valuePeriod}> · {alerta.valor_periodo_label}</span>
                    ) : null}
                  </span>
                ) : null}
                {alerta.documentos_ids?.length ? (
                  <span className={styles.footMeta}>
                    <IconDoc />
                    {alerta.documentos_ids.length} doc{alerta.documentos_ids.length > 1 ? 's' : ''}
                  </span>
                ) : null}
                {alerta.ultima_publicacao_documento ? (
                  <span className={styles.footMeta}>
                    <IconCalendar />
                    {formatDate(alerta.ultima_publicacao_documento)}
                  </span>
                ) : null}
              </div>
            </Link>
          ))}
        </div>
      )}

      <p className={styles.count}>
        {resultado.total} descoberta{resultado.total === 1 ? '' : 's'}
      </p>
    </main>
  );
}
