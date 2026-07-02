import Link from 'next/link';
import SectionBlock from '../../components/SectionBlock';
import { formatMoney, formatDate } from '../../lib/format';

/**
 * Últimos empenhos do período — cada um com deep-link real pro detalhamento
 * no Portal da Transparência (rótulo honesto quando só há busca manual).
 */
export default function EmpenhosRecentes({ ultimosEmpenhos, periodoLabel }) {
  return (
    <SectionBlock
      title={`Empenhos recentes (${periodoLabel})`}
      description="Últimos 20 empenhos por data de empenho no período selecionado. Empenhos com vínculo têm processo licitatório identificado."
      aside={
        <Link href="/acervo?tipo=edital" className="availability-badge is-gov" style={{ textDecoration: 'none' }}>
          Ver licitações
        </Link>
      }
    >
      <div className="products-table">
        {(ultimosEmpenhos || []).map((emp) => (
          <article key={emp.id} className="product-row">
            <div className="product-row-main">
              <div className="document-row-meta">
                <span>{emp.exercicio_orcamento}</span>
                <span>Empenho {emp.empenho}</span>
                {emp.tipo ? <span style={{ fontSize: '0.8rem' }}>{emp.tipo.split(' - ')[0]}</span> : null}
                {emp.portal?.url && (
                  <a
                    href={emp.portal.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="availability-badge is-gov"
                    title={emp.portal.especifico ? 'Detalhamento oficial deste empenho' : 'Portal da Transparência (busca manual)'}
                  >
                    {emp.portal.especifico ? '↗ Ver no Portal' : '↗ Portal (busca manual)'}
                  </a>
                )}
              </div>
              <h3 style={{ margin: '4px 0', fontSize: '1rem' }}>{emp.credor_nome || 'Credor não identificado'}</h3>
              {emp.historico ? (
                <p style={{ margin: '2px 0', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>{emp.historico}</p>
              ) : null}
              {emp.documento_titulo ? (
                <Link href={`/documento/${emp.documento_id}`} style={{ fontSize: '0.83rem', color: 'var(--accent)' }}>
                  {emp.documento_titulo.slice(0, 80)}
                  {emp.documento_titulo.length > 80 ? '…' : ''}
                </Link>
              ) : (
                <span style={{ fontSize: '0.83rem', color: 'var(--text-muted)' }}>Sem processo vinculado</span>
              )}
            </div>
            <div className="product-row-side">
              <div className="document-row-field">
                <span>Valor</span>
                <strong>{formatMoney(emp.valor)}</strong>
              </div>
              <div className="document-row-field">
                <span>Data</span>
                <strong>{formatDate(emp.data_empenho) || '—'}</strong>
              </div>
            </div>
          </article>
        ))}
      </div>
    </SectionBlock>
  );
}
