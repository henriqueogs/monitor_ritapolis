import Link from 'next/link';
import { fetchFornecedoresRanking } from '../../lib/api';
import { formatMoney } from '../../lib/format';

export default async function FornecedoresRanking() {
  const data = await fetchFornecedoresRanking({ limite: 10, ordem: 'valor' }).catch(() => null);
  const fornecedores = data?.dados || [];

  if (!fornecedores.length) return null;

  const valorMax = fornecedores[0]?.total_valor_combinado || 1;

  return (
    <div>
      {fornecedores.map((f, i) => {
        const pct = valorMax > 0 ? Math.round((f.total_valor_combinado / valorMax) * 100) : 0;
        const nome = f.nome_canonico || f.cnpj;
        return (
          <div
            key={f.cnpj}
            style={{
              display: 'grid',
              gridTemplateColumns: '24px 1fr auto',
              gap: '10px 14px',
              alignItems: 'start',
              padding: '10px 0',
              borderBottom: i < fornecedores.length - 1 ? '1px solid var(--border)' : 'none'
            }}
          >
            <span style={{ fontSize: 13, opacity: 0.45, fontVariantNumeric: 'tabular-nums', paddingTop: 1 }}>
              {i + 1}
            </span>
            <div style={{ minWidth: 0 }}>
              <Link
                href={`/licitacoes?fornecedor=${encodeURIComponent(f.cnpj)}`}
                style={{ margin: 0, fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', color: 'inherit', textDecoration: 'none' }}
              >
                {nome}
              </Link>
              <p style={{ margin: '3px 0 6px', fontSize: 12, color: 'var(--text-muted)' }}>
                CNPJ {f.cnpj}
                {f.n_vitorias > 0 ? ` · ${f.n_vitorias} vitória${f.n_vitorias !== 1 ? 's' : ''}` : ''}
                {f.n_itens_produtos > 0 ? ` · ${f.n_itens_produtos} item${f.n_itens_produtos !== 1 ? 'ns' : ''}` : ''}
                {f.anos_ativos?.length ? ` · ${f.anos_ativos.slice(0, 3).join(', ')}` : ''}
              </p>
              <div style={{ height: 4, background: 'var(--surface-muted)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', borderRadius: 2 }} />
              </div>
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', paddingTop: 1 }}>
              {f.total_valor_combinado > 0 ? formatMoney(f.total_valor_combinado) : '—'}
            </span>
          </div>
        );
      })}
      <p style={{ margin: '12px 0 0', fontSize: 12, opacity: 0.4 }}>
        Valores combinam produtos estruturados e contratos com vencedor identificado. Execute{' '}
        <code>npm run inteligencia:fornecedores</code> para atualizar.
      </p>
    </div>
  );
}
