const labels = {
  real: 'Dado real',
  parcial: 'Parcial',
  pendente: 'Pendente',
  demonstrativo: 'Demonstrativo'
};

export default function DataAvailabilityBadge({ status = 'real' }) {
  return (
    <span className={`availability-badge is-${status}`}>
      {labels[status] || status}
    </span>
  );
}
