import { labelStatus } from '../lib/format';

export default function StatusBadge({ value }) {
  if (!value) return <span className="status-badge">Sem status</span>;

  const tone =
    value === 'ok' || value === 'homologada'
      ? 'is-good'
      : value === 'erro_pdf' || value === 'erro_total'
        ? 'is-bad'
        : value === 'aberta' || value === 'em_andamento'
          ? 'is-warn'
          : '';

  return <span className={`status-badge ${tone}`.trim()}>{labelStatus(value)}</span>;
}
