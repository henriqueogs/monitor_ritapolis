import Link from 'next/link';
import { formatMoney, formatDate } from '../lib/format';
import FinalidadeBadge from './FinalidadeBadge';

function StatusPagamento({ emp }) {
  if (emp.data_pagamento) {
    return <span style={{ color: 'var(--success)' }}>Pago em {formatDate(emp.data_pagamento)}</span>;
  }
  if (emp.data_liquidacao) {
    return <span style={{ color: 'var(--warning)' }}>Liquidado em {formatDate(emp.data_liquidacao)}</span>;
  }
  return <span style={{ color: 'var(--text-muted)' }}>Sem registro de pagamento</span>;
}

function LinhaEmpenho({ emp, mostrarCredor }) {
  const area = emp.funcao?.replace(/^\d+\s*-\s*/, '');
  const unidade = emp.unidade?.replace(/^[\d.]+\s*-\s*/, '');
  const fonte = emp.fonte_recurso?.replace(/^[\d.]+\s*-\s*/, '');
  const credorHref = emp.credor_chave || emp.credor_cnpj;

  return (
    <div className="table-row" style={{ display: 'grid', gridTemplateColumns: '92px 1fr 190px 120px', gap: 12, alignItems: 'start', padding: '10px 0' }}>
      <span style={{ fontSize: 12, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
        {formatDate(emp.data_empenho, emp.exercicio_orcamento)}
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <Link href={`/empenho/${emp.id}`} style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
            {emp.empenho}
          </Link>
          <FinalidadeBadge finalidade={emp.finalidade} />
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{emp.tipo}</span>
          {emp.portal?.url && (
            <a href={emp.portal.url} target="_blank" rel="noreferrer" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
              {emp.portal.especifico ? '↗ Ver no Portal' : '↗ Portal (busca manual)'}
            </a>
          )}
        </span>
        {mostrarCredor && emp.credor_nome && (
          <span style={{ display: 'block', fontSize: 13, fontWeight: 500, marginTop: 3 }}>
            {credorHref ? (
              <Link href={`/credores/${credorHref}`} style={{ color: 'inherit' }}>{emp.credor_nome}</Link>
            ) : (
              emp.credor_nome
            )}
          </span>
        )}
        {emp.historico && (
          <span style={{ fontSize: 12, margin: '3px 0 0', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {emp.historico}
          </span>
        )}
        <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
          {[unidade, emp.programa?.replace(/^\d+\s*-\s*/, ''), fonte].filter(Boolean).join(' · ')}
        </span>
        {emp.documento_id && (
          <Link href={`/documento/${emp.documento_id}`} style={{ fontSize: 11 }}>
            Licitação vinculada: {emp.modalidade || emp.documento_titulo || `documento #${emp.documento_id}`}
          </Link>
        )}
      </span>
      <span style={{ fontSize: 12 }}>
        <span style={{ display: 'block', color: 'var(--text-muted)', marginBottom: 2 }}>{area || '—'}</span>
        <StatusPagamento emp={emp} />
      </span>
      <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>{formatMoney(emp.valor)}</span>
    </div>
  );
}

/**
 * Tabela de empenhos compartilhada (perfil do credor, lista geral, categoria).
 * Cada linha linka pra /empenho/[id] e pro detalhamento oficial no portal.
 */
export default function TabelaEmpenhos({ dados, mostrarCredor = false }) {
  if (!dados?.length) {
    return <p style={{ color: 'var(--text-muted)' }}>Nenhum empenho no período selecionado.</p>;
  }
  return (
    <div className="table-scroll-x">
      <div className="simple-table" style={{ minWidth: 640 }}>
        <div className="table-row table-row-header" style={{ display: 'grid', gridTemplateColumns: '92px 1fr 190px 120px', gap: 12 }}>
          <span>Data</span>
          <span>Empenho</span>
          <span>Área · pagamento</span>
          <span style={{ textAlign: 'right' }}>Valor</span>
        </div>
        {dados.map((emp) => (
          <LinhaEmpenho key={emp.id} emp={emp} mostrarCredor={mostrarCredor} />
        ))}
      </div>
    </div>
  );
}
