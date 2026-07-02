import Link from 'next/link';
import { fetchTransparenciaDespesas } from '../../../lib/api';
import { formatMoney, formatDate } from '../../../lib/format';
import SectionBlock from '../../../components/SectionBlock';

const LIMITE = 25;

function tituloPeriodo(exercicio, porAno) {
  if (exercicio) return `Empenhos de ${exercicio}`;
  const anos = (porAno || []).map((r) => r.ano).filter(Boolean);
  if (!anos.length) return 'Todos os empenhos';
  const min = Math.min(...anos);
  const max = Math.max(...anos);
  return min === max ? `Todos os empenhos (${min})` : `Todos os empenhos (${min}–${max})`;
}

function StatusPagamento({ emp }) {
  if (emp.data_pagamento) {
    return <span style={{ color: 'var(--success)' }}>Pago em {formatDate(emp.data_pagamento)}</span>;
  }
  if (emp.data_liquidacao) {
    return <span style={{ color: 'var(--warning)' }}>Liquidado em {formatDate(emp.data_liquidacao)}</span>;
  }
  return <span style={{ color: 'var(--text-muted)' }}>Sem registro de pagamento</span>;
}

function LinhaEmpenho({ emp }) {
  const area = emp.funcao?.replace(/^\d+\s*-\s*/, '');
  const unidade = emp.unidade?.replace(/^[\d.]+\s*-\s*/, '');
  const fonte = emp.fonte_recurso?.replace(/^[\d.]+\s*-\s*/, '');

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
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{emp.tipo}</span>
          {emp.portal?.url && (
            <a href={emp.portal.url} target="_blank" rel="noreferrer" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
              {emp.portal.especifico ? '↗ Ver no Portal' : '↗ Portal (busca manual)'}
            </a>
          )}
        </span>
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
 * Lista completa e paginada de empenhos do credor, com filtro por exercício.
 * Server component — paginação via query params, como em /credores.
 */
export default async function EmpenhosCredor({ cnpj, porAno, pagina = 1, exercicio }) {
  const resultado = await fetchTransparenciaDespesas({
    credor_cnpj: cnpj,
    exercicio,
    pagina,
    limite: LIMITE,
  });
  const dados = resultado?.dados || [];
  const total = resultado?.total || 0;
  const totalPaginas = Math.max(1, Math.ceil(total / LIMITE));
  const anosDisponiveis = (porAno || []).map((r) => r.ano).sort((a, b) => b - a);

  const hrefPagina = (p, ex = exercicio) =>
    `/credores/${cnpj}?${new URLSearchParams({
      ...(ex ? { exercicio: String(ex) } : {}),
      ...(p > 1 ? { pagina: String(p) } : {}),
    })}#empenhos`;

  return (
    <div id="empenhos">
      <SectionBlock
        title={tituloPeriodo(exercicio, porAno)}
        description={`${total} empenho${total !== 1 ? 's' : ''} registrado${total !== 1 ? 's' : ''} no Portal da Transparência da Prefeitura. Cada linha tem link para o detalhamento oficial na fonte.`}
      >
        {anosDisponiveis.length > 1 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            <Link
              href={hrefPagina(1, null)}
              style={{
                padding: '4px 12px', borderRadius: 14, fontSize: 12, textDecoration: 'none',
                background: !exercicio ? 'var(--accent)' : 'var(--surface-muted)',
                color: !exercicio ? '#fff' : 'inherit', fontWeight: 600,
              }}
            >
              Todos
            </Link>
            {anosDisponiveis.map((ano) => (
              <Link
                key={ano}
                href={hrefPagina(1, ano)}
                style={{
                  padding: '4px 12px', borderRadius: 14, fontSize: 12, textDecoration: 'none',
                  background: exercicio === ano ? 'var(--accent)' : 'var(--surface-muted)',
                  color: exercicio === ano ? '#fff' : 'inherit', fontWeight: 600,
                }}
              >
                {ano}
              </Link>
            ))}
          </div>
        )}

        {dados.length === 0 && <p style={{ color: 'var(--text-muted)' }}>Nenhum empenho no período selecionado.</p>}

        {dados.length > 0 && (
          <div className="table-scroll-x">
            <div className="simple-table" style={{ minWidth: 640 }}>
              <div className="table-row table-row-header" style={{ display: 'grid', gridTemplateColumns: '92px 1fr 190px 120px', gap: 12 }}>
                <span>Data</span>
                <span>Empenho</span>
                <span>Área · pagamento</span>
                <span style={{ textAlign: 'right' }}>Valor</span>
              </div>
              {dados.map((emp) => (
                <LinhaEmpenho key={emp.id} emp={emp} />
              ))}
            </div>
          </div>
        )}

        {total > LIMITE && (
          <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'center' }}>
            {pagina > 1 && (
              <Link href={hrefPagina(pagina - 1)} style={{ padding: '6px 16px', borderRadius: 6, background: 'var(--surface-muted)', fontSize: 13 }}>
                ← Anterior
              </Link>
            )}
            <span style={{ padding: '6px 12px', fontSize: 13, color: 'var(--text-muted)' }}>
              Pág. {pagina} de {totalPaginas}
            </span>
            {pagina < totalPaginas && (
              <Link href={hrefPagina(pagina + 1)} style={{ padding: '6px 16px', borderRadius: 6, background: 'var(--surface-muted)', fontSize: 13 }}>
                Próxima →
              </Link>
            )}
          </div>
        )}
      </SectionBlock>
    </div>
  );
}
