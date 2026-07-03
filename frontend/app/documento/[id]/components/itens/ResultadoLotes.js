import { formatMoney } from '../../../../lib/format';
import FonteLink from './FonteLink';
import VencedorLink from './VencedorLink';

// Bloco ② — resultado por lote: vencedor + teto homologado. Registro de preços,
// então o teto NÃO é gasto; mostramos o empenhado até agora como contexto.
export default function ResultadoLotes({ lotes, documento }) {
  if (!lotes?.length) return null;

  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ fontSize: 15, margin: '0 0 4px' }}>Resultado — quem venceu (por lote)</h3>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-muted)' }}>
        Cada lote foi arrematado por um fornecedor. O valor é o <strong>teto homologado</strong> na
        ata (limite do registro de preços) — não o quanto já foi gasto.
      </p>
      <div style={{ display: 'grid', gap: 12 }}>
        {lotes.map((lote) => {
          return (
            <div key={lote.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {lote.lote_numero ? `Lote ${lote.lote_numero}` : 'Lote'}
                  </span>
                  <h4 style={{ margin: '2px 0 4px', fontSize: 14 }}>{lote.objeto}</h4>
                  {lote.fornecedor_nome ? (
                    <span style={{ fontSize: 13 }}>
                      Vencedor: <VencedorLink nome={lote.fornecedor_nome} cnpj={lote.fornecedor_cnpj} />
                    </span>
                  ) : null}
                </div>
                <div style={{ textAlign: 'right' }}>
                  {lote.quarentenado ? (
                    <span style={{ fontSize: 13, color: 'var(--warning)', fontWeight: 600 }}>valor não confiável</span>
                  ) : (
                    <>
                      <strong style={{ display: 'block', fontVariantNumeric: 'tabular-nums' }}>
                        {lote.teto_homologado != null ? formatMoney(lote.teto_homologado) : '—'}
                      </strong>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>teto homologado</span>
                    </>
                  )}
                </div>
              </div>
              <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                {lote.quarentenado
                  ? 'A ata registra um valor acima do valor final do processo — provável erro de digitação na fonte. '
                  : lote.empenhado
                    ? `Não é gasto realizado; o processo tem ${formatMoney(lote.empenhado)} empenhados até agora. `
                    : 'Teto homologado na ata, não é gasto realizado. '}
                <FonteLink anexoOrigemId={lote.anexo_origem_id} urlPdf={documento?.url_pdf} urlOrigem={documento?.url_origem} />
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
