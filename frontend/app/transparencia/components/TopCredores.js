import Link from 'next/link';
import SectionBlock from '../../components/SectionBlock';
import { formatMoney } from '../../lib/format';

const CNPJ_PREFEITURA = '18557553000105';
const th = { padding: '8px 6px', color: 'var(--text-secondary)', fontWeight: 600 };

/**
 * Top credores do período selecionado. Nome linka pro perfil interno
 * (/credores/[cnpj]); o CNPJ mantém a verificação na Receita Federal.
 */
export default function TopCredores({ topCredores, periodoLabel }) {
  const credores = (topCredores || []).filter((c) => c.credor_cnpj !== CNPJ_PREFEITURA);

  return (
    <SectionBlock
      title={`Principais credores (${periodoLabel})`}
      description="Ordenado por valor total empenhado no período. Exclui registros sem CNPJ e a própria Prefeitura (transferências internas). Clique no credor para ver o perfil completo com todos os empenhos."
      aside={
        <Link href="/credores" className="availability-badge is-gov" style={{ textDecoration: 'none' }}>
          Todos os fornecedores
        </Link>
      }
    >
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
            <th style={th}>#</th>
            <th style={th}>Credor</th>
            <th style={th}>CNPJ</th>
            <th style={{ ...th, textAlign: 'right' }}>Empenhos</th>
            <th style={{ ...th, textAlign: 'right' }}>Valor total</th>
            <th style={th}>Exercícios</th>
          </tr>
        </thead>
        <tbody>
          {credores.slice(0, 15).map((c, i) => (
            <tr key={c.credor_cnpj} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '10px 6px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>{i + 1}</td>
              <td style={{ padding: '10px 6px', fontWeight: 500 }}>
                <Link href={`/credores/${c.credor_cnpj}`} style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                  {c.credor_nome || '—'}
                </Link>
              </td>
              <td style={{ padding: '10px 6px', fontFamily: 'monospace', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                <a
                  href={`https://www.receita.fazenda.gov.br/pessoajuridica/cnpj/cnpjreva/cnpjrevaFE.asp?cnpj=${c.credor_cnpj}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Verificar CNPJ na Receita Federal"
                  style={{ color: 'inherit', textDecoration: 'none' }}
                >
                  {c.credor_cnpj} ↗
                </a>
              </td>
              <td style={{ padding: '10px 6px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                {c.n_empenhos?.toLocaleString('pt-BR')}
              </td>
              <td style={{ padding: '10px 6px', textAlign: 'right', fontWeight: 600 }}>{formatMoney(c.valor_total)}</td>
              <td style={{ padding: '10px 6px', color: 'var(--text-muted)', fontSize: '0.83rem' }}>
                {c.primeiro_exercicio === c.ultimo_exercicio
                  ? c.primeiro_exercicio
                  : `${c.primeiro_exercicio}–${c.ultimo_exercicio}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </SectionBlock>
  );
}
