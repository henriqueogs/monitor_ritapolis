import Link from 'next/link';
import { fetchCredores } from '../lib/api';
import { formatMoney } from '../lib/format';
import SectionBlock from '../components/SectionBlock';

export const metadata = {
  title: 'Fornecedores — Monitor Ritápolis',
  description: 'Ranking de fornecedores por valor recebido da Prefeitura de Ritápolis/MG.',
};

export default async function CredoresPage({ searchParams }) {
  const busca = searchParams?.busca || '';
  const exercicio = searchParams?.exercicio ? Number(searchParams.exercicio) : undefined;
  const pagina = searchParams?.pagina ? Number(searchParams.pagina) : 1;

  const resultado = await fetchCredores({ busca, exercicio, pagina, limite: 50 }).catch(() => null);
  const dados = resultado?.dados || [];

  return (
    <main className="page-container">
      <div className="page-title">
        <div>
          <h1>Fornecedores</h1>
          <p>Empresas e pessoas que receberam pagamentos da Prefeitura. Clique em um fornecedor para ver o perfil completo.</p>
        </div>
      </div>

      {/* Filtros */}
      <form method="get" style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <input
          name="busca"
          defaultValue={busca}
          placeholder="Buscar por nome…"
          style={{
            flex: '1 1 200px', padding: '8px 12px', border: '1px solid var(--border)',
            borderRadius: 6, fontSize: 14, background: 'var(--surface)',
          }}
        />
        <select
          name="exercicio"
          defaultValue={exercicio || ''}
          style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 14, background: 'var(--surface)' }}
        >
          <option value="">Todos os anos</option>
          {Array.from({ length: new Date().getFullYear() - 2023 + 1 }, (_, i) => 2023 + i).map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <button
          type="submit"
          style={{
            padding: '8px 20px', background: 'var(--accent)', color: '#fff',
            border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Filtrar
        </button>
      </form>

      <SectionBlock
        title={`${resultado?.total || 0} fornecedores encontrados`}
        description="Excluindo folha de pagamento e repasses obrigatórios."
      >
        {dados.length === 0 && (
          <p style={{ color: 'var(--text-muted)' }}>Nenhum fornecedor encontrado.</p>
        )}
        {dados.length > 0 && (
          <div className="table-scroll-x">
            <div className="simple-table" style={{ minWidth: 720 }}>
              <div className="table-row table-row-header" style={{ display: 'grid', gridTemplateColumns: '50px 1fr 160px 100px 90px 130px', gap: 12, alignItems: 'center' }}>
                <span>#</span>
                <span>Fornecedor</span>
                <span>CNPJ</span>
                <span style={{ textAlign: 'center' }}>Anos</span>
                <span style={{ textAlign: 'center' }}>Empenhos</span>
                <span style={{ textAlign: 'right' }}>Total recebido</span>
              </div>
              {dados.map((c, idx) => (
                <Link
                  key={c.credor_chave || c.credor_cnpj}
                  href={`/credores/${c.credor_chave || c.credor_cnpj}`}
                  className="table-row"
                  style={{
                    textDecoration: 'none',
                    color: 'inherit',
                    display: 'grid',
                    gridTemplateColumns: '50px 1fr 160px 100px 90px 130px',
                    gap: 12,
                    alignItems: 'center'
                  }}
                >
                  <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                    {(pagina - 1) * 50 + idx + 1}
                  </span>
                  <span style={{ fontWeight: 500, fontSize: 14 }}>{c.credor_nome}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                    {c.credor_cnpj
                      ? c.credor_cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
                      : 'Pessoa física'}
                  </span>
                  <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', textAlign: 'center' }}>
                    {c.primeiro_ano === c.ultimo_ano ? c.primeiro_ano : `${c.primeiro_ano}–${c.ultimo_ano}`}
                  </span>
                  <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', textAlign: 'center' }}>{c.n_empenhos}</span>
                  <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
                    {formatMoney(c.valor_total)}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Paginação simples */}
        {resultado?.total > 50 && (
          <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'center' }}>
            {pagina > 1 && (
              <Link
                href={`/credores?busca=${busca}&exercicio=${exercicio || ''}&pagina=${pagina - 1}`}
                style={{ padding: '6px 16px', borderRadius: 6, background: 'var(--surface-muted)', fontSize: 13 }}
              >
                ← Anterior
              </Link>
            )}
            <span style={{ padding: '6px 12px', fontSize: 13, color: 'var(--text-muted)' }}>
              Pág. {pagina} de {Math.ceil(resultado.total / 50)}
            </span>
            {pagina * 50 < resultado.total && (
              <Link
                href={`/credores?busca=${busca}&exercicio=${exercicio || ''}&pagina=${pagina + 1}`}
                style={{ padding: '6px 16px', borderRadius: 6, background: 'var(--surface-muted)', fontSize: 13 }}
              >
                Próxima →
              </Link>
            )}
          </div>
        )}
      </SectionBlock>
    </main>
  );
}
