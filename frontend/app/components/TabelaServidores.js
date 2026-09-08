import { formatMoney } from '../lib/format';

const MESES = [
  '', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez', '13º',
];

function competenciaLabel(ano, mes) {
  const nomeMes = MESES[Number(mes)] || mes;
  return `${nomeMes}/${ano}`;
}

function LinhaServidor({ item }) {
  const secretaria = item.secretaria?.replace(/^DEPARTAMENTO MUNICIPAL DE\s*/i, '') || '—';

  return (
    <div className="table-row" style={{ display: 'grid', gridTemplateColumns: '1fr 190px 110px 140px', gap: 12, alignItems: 'start', padding: '10px 0' }}>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>{item.nome_servidor}</span>
        <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
          {item.cargo}
        </span>
        {item.portal?.url && (
          <a href={item.portal.url} target="_blank" rel="noreferrer" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
            ↗ Portal (busca manual)
          </a>
        )}
      </span>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{secretaria}</span>
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        {item.situacao || '—'}
      </span>
      <span style={{ textAlign: 'right' }}>
        <span style={{ display: 'block', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
          {formatMoney(item.remuneracao_bruta)}
        </span>
        <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)' }}>
          bruto em {competenciaLabel(item.competencia_ano, item.competencia_mes)}
        </span>
      </span>
    </div>
  );
}

/**
 * Tabela de servidores da folha salarial. Cada valor carrega a competência
 * no rótulo (§11.1 — nunca um número monetário solto sem período).
 */
export default function TabelaServidores({ dados }) {
  if (!dados?.length) {
    return <p style={{ color: 'var(--text-muted)' }}>Nenhum servidor encontrado com esses filtros.</p>;
  }
  return (
    <div className="table-scroll-x">
      <div className="simple-table" style={{ minWidth: 640 }}>
        <div className="table-row table-row-header" style={{ display: 'grid', gridTemplateColumns: '1fr 190px 110px 140px', gap: 12 }}>
          <span>Servidor</span>
          <span>Secretaria</span>
          <span>Situação</span>
          <span style={{ textAlign: 'right' }}>Remuneração</span>
        </div>
        {dados.map((item) => (
          <LinhaServidor key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}
