import Link from 'next/link';
import { fetchAlerta } from '../../../lib/api';
import { formatMoney, formatDate, labelTipo } from '../../../lib/format';

const SEVERIDADE_LABEL = {
  critico: 'Crítico',
  atencao: 'Atenção',
  info: 'Informação',
};

const SEVERIDADE_CLASSE = {
  critico: 'badge-critical',
  atencao: 'badge-warning',
  info: 'badge-info',
};

export default async function AlertaDetalhePage({ params }) {
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
      <main className="page-container page-observatory">
        <header className="page-head">
          <h1>Alerta não encontrado</h1>
          <Link href="/alertas" className="link">&larr; Voltar para alertas</Link>
        </header>
        <p className="empty-state">{erro || 'O alerta solicitado não existe ou foi removido.'}</p>
      </main>
    );
  }

  const documentos = alerta.documentos || [];

  return (
    <main className="page-container page-observatory">
      <header className="page-head">
        <Link href="/alertas" className="link">&larr; Todos os alertas</Link>
        <h1>{alerta.titulo}</h1>
        <div className="badge-row">
          <span className={`badge ${SEVERIDADE_CLASSE[alerta.severidade] || 'badge-info'}`}>
            {SEVERIDADE_LABEL[alerta.severidade] || alerta.severidade}
          </span>
          {alerta.categoria ? <span className="badge badge-info">{alerta.categoria}</span> : null}
          <span className="badge">{alerta.tipo}</span>
        </div>
      </header>

      {alerta.narrativa ? (
        <section className="section-block">
          <h2>Análise</h2>
          <p className="narrativa-texto">{alerta.narrativa}</p>
        </section>
      ) : null}

      {alerta.valor_total ? (
        <section className="section-block">
          <h2>Valores</h2>
          <div className="metric-row">
            <div className="metric">
              <span className="metric-label">Total</span>
              <span className="metric-value">{formatMoney(alerta.valor_total)}</span>
            </div>
            {alerta.valor_periodo_label ? (
              <div className="metric">
                <span className="metric-label">Período</span>
                <span className="metric-value">{alerta.valor_periodo_label}</span>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {alerta.periodo_inicio || alerta.periodo_fim ? (
        <section className="section-block">
          <h2>Período coberto</h2>
          <p>
            {alerta.periodo_inicio ? formatDate(alerta.periodo_inicio) : '—'}
            {' até '}
            {alerta.periodo_fim ? formatDate(alerta.periodo_fim) : '—'}
          </p>
        </section>
      ) : null}

      {alerta.questionamentos?.length ? (
        <section className="section-block">
          <h2>Questionamentos em aberto</h2>
          <ul className="questionamentos-list">
            {alerta.questionamentos.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {documentos.length ? (
        <section className="section-block">
          <h2>Documentos vinculados ({documentos.length})</h2>
          <p className="section-note">
            Cada documento mantém o link para sua fonte original — a procedência nunca some.
          </p>
          <div className="citizen-list">
            {documentos.map((doc) => (
              <div key={doc.documento_id} className="citizen-card">
                <div className="citizen-card-head">
                  <span className="badge">{labelTipo(doc.tipo)}</span>
                  {doc.ano ? <span className="muted">{doc.ano}</span> : null}
                  <span className="muted">papel: {doc.papel}</span>
                </div>
                <h3 className="citizen-card-title">
                  <Link href={`/documento/${doc.documento_id}`}>{doc.titulo || `Documento ${doc.documento_id}`}</Link>
                </h3>
                <div className="citizen-card-meta">
                  {doc.data_publicacao ? (
                    <span>Publicado: {formatDate(doc.data_publicacao)}</span>
                  ) : null}
                  {doc.url_origem ? (
                    <a href={doc.url_origem} target="_blank" rel="noopener noreferrer">
                      Abrir fonte original &rarr;
                    </a>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
