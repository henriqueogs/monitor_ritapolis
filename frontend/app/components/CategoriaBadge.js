// Mapeamento para tokens do design system Gov.br
// Usa CSS custom properties definidos em globals.css
const ESTILOS = {
  'Alimentação':              { bg: 'var(--warning-soft)',  color: 'var(--warning)' },
  'Saúde':                    { bg: 'var(--error-soft)',    color: 'var(--error)' },
  'Educação':                 { bg: 'var(--accent-soft)',   color: 'var(--accent)' },
  'Obras e Infraestrutura':   { bg: 'var(--demo-soft)',     color: 'var(--demo)' },
  'Serviços':                 { bg: 'var(--ai-soft)',       color: 'var(--ai-accent)' },
  'Equipamentos e Materiais': { bg: 'rgba(183,121,31,0.1)', color: '#9a5f00' },
  'Outros':                   { bg: 'var(--surface-muted)', color: 'var(--text-muted)' }
};

export default function CategoriaBadge({ categoria }) {
  if (!categoria) return null;
  const { bg, color } = ESTILOS[categoria] || ESTILOS['Outros'];
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 'var(--radius-sm)',
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.02em',
        background: bg,
        color,
        whiteSpace: 'nowrap'
      }}
    >
      {categoria}
    </span>
  );
}
