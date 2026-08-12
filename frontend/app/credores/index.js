import Link from 'next/link';
import { fetchCredores } from '../lib/api';
import { formatMoney } from '../lib/format';
import SectionBlock from '../components/SectionBlock';
import FinalidadeBadge from '../components/FinalidadeBadge';
import TransparenciaSubnav from '../components/TransparenciaSubnav';
import { FINALIDADE_OPCOES } from '../lib/finalidades';

export const metadata = {
  title: 'Credores',
  description: 'Quem recebe dinheiro da Prefeitura de Ritápolis/MG: empresas, pessoas, ONGs, órgãos públicos.',
};

const FINALIDADES = FINALIDADE_OPCOES;

export default async function CredoresPage({ searchParams: searchParamsPromise }) {
  const searchParams = await searchParamsPromise;
  const busca = searchParams?.busca || '';
  const exercicio = searchParams?.exercicio ? Number(searchParams.exercicio) : undefined;
  const mandato = !exercicio && searchParams?.mandato ? Number(searchParams.mandato) : undefined;
  const periodoTodos = !exercicio && !mandato && searchParams?.periodo === 'todos';
  const finalidade = searchParams?.finalidade || '';
  const pagina = searchParams?.pagina ? Number(searchParams.pagina) : 1;

  const resultado = await fetchCredores({ busca, exercicio, mandato, finalidade, pagina, limite: 50 }).catch(() => null);
  const dados = resultado?.dados || [];
  const periodoParams = {
    ...(exercicio ? { exercicio: String(exercicio) } : {}),
    ...(mandato ? { mandato: String(mandato) } : {}),
    ...(periodoTodos ? { periodo: 'todos' } : {}),
  };
  const queryPagina = (p) => `/credores?${new URLSearchParams({
    ...(busca ? { busca } : {}),
    ...periodoParams,
    ...(finalidade ? { finalidade } : {}),
    ...(p > 1 ? { pagina: String(p) } : {}),
  })}`;

  return (
    <main className="page-container">
      <div className="page-title">
        <div>
          <h1>Credores</h1>
          <p>Quem recebeu dinheiro da Prefeitura — empresas, pessoas, ONGs e órgãos públicos. Clique em um credor para ver o perfil completo.</p>
        </div>
      </div>

      <TransparenciaSubnav />

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
        {mandato && <input type="hidden" name="mandato" value={mandato} />}
        {periodoTodos && <input type="hidden" name="periodo" value="todos" />}
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
        <select
          name="finalidade"
          defaultValue={finalidade}
          style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 14, background: 'var(--surface)' }}
        >
          <option value="">Todas as finalidades</option>
          {FINALIDADES.map((item) => (
            <option key={item.value} value={item.value}>{item.label}</option>
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
        title={`${resultado?.total || 0} credores encontrados`}
        description={finalidade
          ? `Filtrando credores com empenhos de finalidade ${FINALIDADES.find((item) => item.value === finalidade)?.label || finalidade}.`
          : 'Excluindo folha de pagamento e repasses obrigatórios.'}
      >
        {dados.length === 0 && (
          <p style={{ color: 'var(--text-muted)' }}>Nenhum fornecedor encontrado.</p>
        )}
        {dados.length > 0 && (
          <div className="table-scroll-x">
            <div className="simple-table" style={{ minWidth: 900 }}>
              <div className="table-row table-row-header" style={{ display: 'grid', gridTemplateColumns: '50px 1fr 170px 150px 90px 90px 130px', gap: 12, alignItems: 'center' }}>
                <span>#</span>
                <span>Credor</span>
                <span>CNPJ</span>
                <span>Finalidade</span>
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
                    gridTemplateColumns: '50px 1fr 170px 150px 90px 90px 130px',
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
                  <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    {(c.finalidades || []).slice(0, 2).map((finalidade) => (
                      <FinalidadeBadge
                        key={finalidade.classe}
                        finalidade={finalidade}
                        title={`${finalidade.rotulo}: ${finalidade.n?.toLocaleString('pt-BR')} empenho${finalidade.n === 1 ? '' : 's'}`}
                      />
                    ))}
                    {!c.finalidades?.length ? (
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sem classe</span>
                    ) : null}
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
                href={queryPagina(pagina - 1)}
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
                href={queryPagina(pagina + 1)}
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
