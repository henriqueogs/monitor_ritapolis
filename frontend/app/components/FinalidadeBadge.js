const TONES = {
  gov: { bg: 'var(--accent-soft)', color: 'var(--accent)' },
  servidor: { bg: 'var(--warning-soft)', color: 'var(--warning)' },
  entidade: { bg: 'var(--success-soft)', color: 'var(--success)' },
  pessoal: { bg: 'var(--surface-muted)', color: 'var(--text-muted)' },
  auxilio: { bg: 'var(--warning-soft)', color: 'var(--warning)' },
  servico: { bg: 'var(--ai-soft)', color: 'var(--ai-accent)' },
  investimento: { bg: 'var(--demo-soft)', color: 'var(--demo)' },
  neutro: { bg: 'var(--surface-muted)', color: 'var(--text-muted)' },
};

export default function FinalidadeBadge({ finalidade, title }) {
  if (!finalidade?.rotulo) return null;
  const tone = TONES[finalidade.tom] || TONES.neutro;
  const titleText = title || (
    Number.isFinite(finalidade.confianca)
      ? `${finalidade.rotulo} (${Math.round((finalidade.confianca || 0) * 100)}% de confianca)`
      : finalidade.rotulo
  );
  return (
    <span
      title={titleText}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 'var(--radius-pill)',
        fontSize: 11,
        fontWeight: 700,
        lineHeight: 1.4,
        background: tone.bg,
        color: tone.color,
        whiteSpace: 'nowrap',
      }}
    >
      {finalidade.rotulo}
    </span>
  );
}
