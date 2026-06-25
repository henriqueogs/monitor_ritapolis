import Link from 'next/link';
import { fetchAlerta } from '../../lib/api';
import { formatMoney, formatDate, labelTipo } from '../../lib/format';
import { nivelLabel } from '../../lib/descobertas';
import { DISCLAIMER_DESCOBERTAS } from '../../lib/disclaimer';
import styles from '../styles.module.css';

const BADGE_NIVEL = {
  critico: styles.badgeCritico,
  atencao: styles.badgeAtencao,
  info: styles.badgeNeutral,
};

export default async function DescobertaDetalhePage({ params }) {
  const id = Number(params.id);
  let alerta = null;
  let erro = null;

  try {
    alerta = await fetchAlerta(id);
  } catch (err) {
    erro = err.message;
  }

  if (erro || !alerta) {
    return (
      <main className={styles.container}>
        <Link href="/descobertas" className={styles.back}>← Voltar para descobertas</Link>
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>Descoberta não encontrada</p>
          <p>{erro || 'A descoberta solicitada não existe ou foi removida.'}</p>
        </div>
      </main>
    );
  }

  const documentos = alerta.documentos || [];

  return (
    <main className={styles.container}>
      <header className={styles.detailHead}>
        <Link href="/descobertas" className={styles.back}>← Todas as descobertas</Link>
        <h1 className={styles.detailTitle}>{alerta.titulo}</h1>
        <div className={styles.detailBadges}>
          <span className={`${styles.badge} ${BADGE_NIVEL[alerta.severidade] || styles.badgeNeutral}`}>
            {nivelLabel(alerta.severidade)}
          </span>
          {alerta.categoria ? <span className={styles.badge}>{alerta.categoria}</span> : null}
          <span className={styles.badge}>{alerta.tipo === 'processo' ? 'por processo' : 'padrão'}</span>
        </div>
        <p className={styles.disclaimer}>{DISCLAIMER_DESCOBERTAS}</p>
      </header>

      {alerta.narrativa ? (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Análise</h2>
          <p className={styles.narrativa}>{alerta.narrativa}</p>
        </section>
      ) : null}

      {alerta.valor_total ? (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Valores</h2>
          <div className={styles.metrics}>
            <div className={styles.metric}>
              <span className={styles.metricLabel}>Total</span>
              <span className={styles.metricValue}>{formatMoney(alerta.valor_total)}</span>
            </div>
            {alerta.valor_periodo_label ? (
              <div className={styles.metric}>
                <span className={styles.metricLabel}>Período</span>
                <span className={styles.metricValue}>{alerta.valor_periodo_label}</span>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {alerta.periodo_inicio || alerta.periodo_fim ? (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Período coberto</h2>
          <p className={styles.narrativa}>
            {alerta.periodo_inicio ? formatDate(alerta.periodo_inicio) : '—'}
            {' até '}
            {alerta.periodo_fim ? formatDate(alerta.periodo_fim) : '—'}
          </p>
        </section>
      ) : null}

      {alerta.questionamentos?.length ? (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Pontos para investigar</h2>
          <ul className={styles.investigar}>
            {alerta.questionamentos.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {documentos.length ? (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Documentos vinculados ({documentos.length})</h2>
          <p className={styles.sectionNote}>
            Cada documento mantém o link para sua fonte original — a procedência nunca some.
          </p>
          <div className={styles.docs}>
            {documentos.map((doc) => (
              <article key={doc.documento_id} className={styles.docCard}>
                <div className={styles.docTop}>
                  <span className={styles.badge}>{labelTipo(doc.tipo)}</span>
                  {doc.ano ? <span className={styles.tag}>{doc.ano}</span> : null}
                  <span className={styles.tag}>papel: {doc.papel}</span>
                </div>
                <h3 className={styles.docTitle}>
                  <Link href={`/documento/${doc.documento_id}`}>
                    {doc.titulo || `Documento ${doc.documento_id}`}
                  </Link>
                </h3>
                <div className={styles.docMeta}>
                  {doc.data_publicacao ? (
                    <span>Publicado: {formatDate(doc.data_publicacao)}</span>
                  ) : null}
                  {doc.url_origem ? (
                    <a
                      href={doc.url_origem}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.sourceLink}
                    >
                      Abrir fonte original ↗
                    </a>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
