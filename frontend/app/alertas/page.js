import Link from 'next/link';
import { fetchAlertas } from '../lib/api';
import { formatMoney, formatDate } from '../lib/format';

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

export default async function AlertasPage({ searchParams }) {
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
        <h1>Alertas de inteligência</h1>
        <p className="section-note">
          Padrões e sinais de atenção detectados pela análise dos documentos públicos.
        </p>
      </header>

      <div className="filter-bar">
        <Link href="/alertas?severidade=critico" className="badge badge-critical">Críticos</Link>
        <Link href="/alertas?severidade=atencao" className="badge badge-warning">Atenção</Link>
        <Link href="/alertas?tipo=tematico" className="badge badge-info">Temáticos</Link>
        <Link href="/alertas?tipo=processo" className="badge badge-info">Por processo</Link>
        <Link href="/alertas" className="badge">Todos</Link>
      </div>

      {alertas.length === 0 ? (
        <p className="empty-state">Nenhum alerta ativo no momento.</p>
      ) : (
        <div className="citizen-list">
          {alertas.map((alerta) => (
            <Link key={alerta.id} href={`/alertas/${alerta.id}`} className="citizen-card">
              <div className="citizen-card-head">
                <span className={`badge ${SEVERIDADE_CLASSE[alerta.severidade] || 'badge-info'}`}>
                  {SEVERIDADE_LABEL[alerta.severidade] || alerta.severidade}
                </span>
                <span className="muted">{alerta.categoria || 'Geral'}</span>
                <span className="muted">{alerta.tipo}</span>
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
        <span className="muted">{resultado.total} alerta(s)</span>
      </div>
    </main>
  );
}
