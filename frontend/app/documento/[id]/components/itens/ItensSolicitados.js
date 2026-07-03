import { formatMoney } from '../../../../lib/format';
import FonteLink from './FonteLink';

// Bloco ① — a demanda do edital: o que a Prefeitura quis contratar.
// Preço final só aparece quando o resultado foi POR ITEM (não teto de lote).
export default function ItensSolicitados({ itens, documento }) {
  if (!itens?.length) return null;

  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ fontSize: 15, margin: '0 0 4px' }}>O que foi solicitado</h3>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-muted)' }}>
        Itens listados no edital, com quantidade e valor estimado. Preço final por item aparece
        quando a ata detalhou o resultado item a item.
      </p>
      <div className="simple-table">
        <div className="table-row table-row-header" style={{ display: 'grid', gridTemplateColumns: '48px 1fr 120px 150px', gap: 12 }}>
          <span>Item</span>
          <span>Descrição</span>
          <span style={{ textAlign: 'right' }}>Estimado</span>
          <span style={{ textAlign: 'right' }}>Resultado</span>
        </div>
        {itens.map((it) => (
          <div key={it.id} className="table-row" style={{ display: 'grid', gridTemplateColumns: '48px 1fr 120px 150px', gap: 12, alignItems: 'start', padding: '10px 0' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{it.item_numero || '—'}</span>
            <span style={{ minWidth: 0 }}>
              <span style={{ fontSize: 13, display: 'block' }}>{it.descricao}</span>
              {it.quantidade != null ? (
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {it.quantidade} {it.unidade || ''}
                </span>
              ) : null}
              {it.grupo_id ? (
                <a href={`/inteligencia/financeira#grupo-${it.grupo_id}`} style={{ fontSize: 11, display: 'block' }}>
                  evolução de preço deste item →
                </a>
              ) : null}
            </span>
            <span style={{ fontSize: 13, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>
              {it.valor_estimado != null ? formatMoney(it.valor_estimado) : '—'}
            </span>
            <span style={{ fontSize: 13, textAlign: 'right' }}>
              {it.resultado_item ? (
                <>
                  <strong style={{ display: 'block', fontVariantNumeric: 'tabular-nums' }}>
                    {formatMoney(it.resultado_item.valor)}
                  </strong>
                  {it.resultado_item.fornecedor_nome ? (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{it.resultado_item.fornecedor_nome}</span>
                  ) : null}
                  <FonteLink anexoOrigemId={it.anexo_origem_id} urlPdf={documento?.url_pdf} urlOrigem={documento?.url_origem} />
                </>
              ) : (
                <span style={{ color: 'var(--text-muted)' }}>—</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
