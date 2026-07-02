/**
 * OrigemBadge — chip inline que indica a fonte de um dado específico.
 * Torna-se um link externo quando a origem tem URL conhecida.
 *
 * Props:
 *   origem   {string}  — valor do campo `origem` do DB (ex: 'portal_transparencia')
 *   url      {string}  — sobrescreve a URL padrão da origem (ex: URL PNCP do documento)
 */

const ORIGEM_CONFIG = {
  portal_transparencia: {
    label: 'Portal Transparência',
    variant: 'gov',
    // Listagem genérica — quem tem um empenho específico deve passar o
    // deep-link da API (`emp.portal.url`) na prop `url`.
    url: 'https://pt.ritapolis.mg.gov.br/Tempo_Real_Despesa',
  },
  pncp: {
    label: 'PNCP',
    variant: 'gov',
    url: 'https://pncp.gov.br',
  },
  ia_resumo: {
    label: 'IA (resumo)',
    variant: 'parcial',
    url: null,
  },
  ata_resultado: {
    label: 'Ata de resultado',
    variant: 'real',
    url: null,
  },
  'texto_tabela+ata_resultado': {
    label: 'Tabela + Ata',
    variant: 'real',
    url: null,
  },
  'ia_resumo+ata_resultado': {
    label: 'IA + Ata',
    variant: 'parcial',
    url: null,
  },
  texto_tabela: {
    label: 'Tabela do edital',
    variant: 'real',
    url: null,
  },
  cadastro_oficial: {
    label: 'Cadastro oficial',
    variant: 'real',
    url: null,
  },
  texto_extraido: {
    label: 'Texto extraído',
    variant: 'parcial',
    url: null,
  },
  resumo: {
    label: 'Resumo',
    variant: 'parcial',
    url: null,
  },
};

export default function OrigemBadge({ origem, url: urlOverride }) {
  if (!origem) return null;

  const cfg = ORIGEM_CONFIG[origem] || { label: origem, variant: 'pendente', url: null };
  // urlOverride=null desativa o link mesmo que a config tenha URL padrão
  const url = urlOverride !== undefined ? urlOverride : cfg.url;

  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={`availability-badge is-${cfg.variant} origin-badge`}
        title={`Verificar no ${cfg.label}`}
      >
        {cfg.label} ↗
      </a>
    );
  }

  return (
    <span
      className={`availability-badge is-${cfg.variant} origin-badge`}
      title={`Fonte: ${cfg.label}`}
    >
      {cfg.label}
    </span>
  );
}
