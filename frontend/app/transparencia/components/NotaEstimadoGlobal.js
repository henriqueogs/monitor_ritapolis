import { formatMoney } from '../../lib/format';

/**
 * Aviso padrão: empenhos estimativos/globais (previsão, parcelas futuras) ficam
 * FORA do valor principal e aparecem só como nota (fiscal-valores V2).
 */
export default function NotaEstimadoGlobal({ valor, align = 'right' }) {
  if (!(valor > 0)) return null;
  return (
    <small style={{ display: 'block', fontWeight: 400, fontSize: 11, color: 'var(--text-muted)', textAlign: align }}>
      + {formatMoney(valor)} estim./global (fora do total)
    </small>
  );
}
