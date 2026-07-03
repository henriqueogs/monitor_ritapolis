import { formatMoney } from '../../../../lib/format';
import FonteLink from './FonteLink';
import VencedorLink from './VencedorLink';

// Bloco ③ — resultado global: valor único do processo (sem quebra por item/lote).
export default function ResultadoGlobal({ global, documento }) {
  if (!global) return null;

  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ fontSize: 15, margin: '0 0 4px' }}>Resultado global</h3>
      <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <h4 style={{ margin: '0 0 4px', fontSize: 14 }}>{global.descricao || 'Valor global do processo'}</h4>
          {global.fornecedor_nome ? (
            <span style={{ fontSize: 13 }}>
              Vencedor: <VencedorLink nome={global.fornecedor_nome} cnpj={global.fornecedor_cnpj} />
            </span>
          ) : null}
          <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
            <FonteLink anexoOrigemId={global.anexo_origem_id} urlPdf={documento?.url_pdf} urlOrigem={documento?.url_origem} />
          </p>
        </div>
        <strong style={{ fontVariantNumeric: 'tabular-nums' }}>
          {global.valor != null ? formatMoney(global.valor) : '—'}
        </strong>
      </div>
    </div>
  );
}
