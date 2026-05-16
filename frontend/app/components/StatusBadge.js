import { CheckCircle2, AlertCircle, XCircle, CircleDashed } from 'lucide-react';
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

  const icon =
    tone === 'is-good' ? <CheckCircle2 size={13} /> :
      tone === 'is-bad' ? <XCircle size={13} /> :
        tone === 'is-warn' ? <AlertCircle size={13} /> :
          <CircleDashed size={13} />;

  return (
    <span className={`status-badge ${tone}`.trim()}>
      {icon}
      {labelStatus(value)}
    </span>
  );
}
