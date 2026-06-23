import Link from 'next/link';
import { fetchAlertas } from '../lib/api';
import { formatMoney, formatDate } from '../lib/format';
import { nivelLabel, nivelClasse } from '../lib/descobertas';

export const metadata = {
  title: 'Descobertas — Monitor Ritápolis',
  description: 'Curiosidades e padrões encontrados nos documentos públicos de Ritápolis/MG.',
};

export default async function DescobertasPage({ searchParams }) {
  const params = searchParams || {};
  const resultado = await fetchAlertas({
    tipo: params.tipo || undefined,
    categoria: params.categoria || undefined,
    severidade: params.severidade || undefined,
    status: params.status || 'ativo',
    pagina: params.pagina || 1,
    limite: params.limite || 20,
  }).catch(() => ({ total: 0, dados: [], pagina: 1, limite: 20 }));

  const alertas = resultado.dados || [];

  return (
    <main className="page-container page-observatory">
      <header className="page-head">
        <h1>Descobertas nos dados</h1>
        <p className="section-note">
          Curiosidades e padrões que a análise encontrou nos documentos públicos. São pontos para
          explorar e entender — a maioria é normal; o objetivo é dar visibilidade, não alarmar.
        </p>
      </header>

      <div className="filter-bar">
        <Link href="/descobertas?severidade=critico" className="badge badge-warning">Merece atenção</Link>
        <Link href="/descobertas?severidade=atencao" className="badge badge-info">Vale conferir</Link>
        <Link href="/descobertas?tipo=tematico" className="badge">Padrões</Link>
        <Link href="/descobertas?tipo=processo" className="badge">Por processo</Link>
        <Link href="/descobertas" className="badge">Todas</Link>
      </div>

      {alertas.length === 0 ? (
        <p className="empty-state">Nenhuma descoberta ativa no momento.</p>
      ) : (
        <div className="citizen-list">
          {alertas.map((alerta) => (
            <Link key={alerta.id} href={`/descobertas/${alerta.id}`} className="citizen-card">
              <div className="citizen-card-head">
                <span className={`badge ${nivelClasse(alerta.severidade)}`}>
                  {nivelLabel(alerta.severidade)}
                </span>
                <span className="muted">{alerta.categoria || 'Geral'}</span>
                <span className="muted">{alerta.tipo === 'processo' ? 'por processo' : 'padrão'}</span>
              </div>
              <h3 className="citizen-card-title">{alerta.titulo}</h3>
              {alerta.narrativa ? (
                <p className="citizen-card-summary">{alerta.narrativa.slice(0, 280)}</p>
              ) : null}
              <div className="citizen-card-meta">
                {alerta.valor_total ? (
                  <span>
                    {formatMoney(alerta.valor_total)}
                    {alerta.valor_periodo_label ? ` (${alerta.valor_periodo_label})` : ''}
                  </span>
                ) : null}
                {alerta.documentos_ids?.length ? (
                  <span>{alerta.documentos_ids.length} documento(s)</span>
                ) : null}
                {alerta.ultima_publicacao_documento ? (
                  <span>Última publicação: {formatDate(alerta.ultima_publicacao_documento)}</span>
                ) : null}
              </div>
            </Link>
          ))}
        </div>
      )}

      <div className="pagination">
        <span className="muted">{resultado.total} descoberta(s)</span>
      </div>
    </main>
  );
}
