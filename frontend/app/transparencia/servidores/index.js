// deploy-test: valida se o Vercel volta a gerar deployment de producao
import Link from 'next/link';
import { fetchTransparenciaFolhaServidores } from '../../lib/api';
import SectionBlock from '../../components/SectionBlock';
import TabelaServidores from '../../components/TabelaServidores';
import FilterBar from '../../components/FilterBar';
import TransparenciaSubnav from '../../components/TransparenciaSubnav';

export const metadata = {
  title: 'Servidores — Dinheiro público',
  description: 'Folha salarial da Prefeitura de Ritápolis: cargo, secretaria e remuneração por competência.',
};

const LIMITE = 25;
const ANO_MIN = 2013;
const MESES = [
  { value: '', label: 'Todos os meses' },
  { value: '1', label: 'Janeiro' }, { value: '2', label: 'Fevereiro' }, { value: '3', label: 'Março' },
  { value: '4', label: 'Abril' }, { value: '5', label: 'Maio' }, { value: '6', label: 'Junho' },
  { value: '7', label: 'Julho' }, { value: '8', label: 'Agosto' }, { value: '9', label: 'Setembro' },
  { value: '10', label: 'Outubro' }, { value: '11', label: 'Novembro' }, { value: '12', label: 'Dezembro' },
  { value: '13', label: '13º salário' },
];

export default async function ServidoresPage({ searchParams: searchParamsPromise }) {
  const searchParams = await searchParamsPromise;
  const q = searchParams?.q || '';
  const secretaria = searchParams?.secretaria || '';
  const anoAtual = new Date().getFullYear();
  const pagina = searchParams?.pagina ? Number(searchParams.pagina) : 1;

  // Sem competencia escolhida (1a visita), usa a mais recente com dado --
  // o mes corrente calendario quase sempre ainda nao foi publicado no portal
  // (folha do mes so fecha depois), o que dava "0 encontrados" de cara.
  let competenciaAno = searchParams?.competencia_ano ? Number(searchParams.competencia_ano) : null;
  let competenciaMes = searchParams?.competencia_mes !== undefined ? searchParams.competencia_mes : null;
  if (searchParams?.competencia_ano === undefined && searchParams?.competencia_mes === undefined) {
    const ultima = await fetchTransparenciaFolhaServidores({ limite: 1 }).catch(() => null);
    const linha = ultima?.dados?.[0];
    competenciaAno = linha?.competencia_ano || anoAtual;
    competenciaMes = linha ? String(linha.competencia_mes) : '';
  }
  competenciaAno = competenciaAno || anoAtual;
  competenciaMes = competenciaMes || '';

  const resultado = await fetchTransparenciaFolhaServidores({
    q: q || undefined,
    secretaria: secretaria || undefined,
    competencia_ano: competenciaAno,
    competencia_mes: competenciaMes || undefined,
    pagina,
    limite: LIMITE,
  });
  const dados = resultado?.dados || [];
  const total = resultado?.total || 0;
  const totalPaginas = Math.max(1, Math.ceil(total / LIMITE));

  const href = (params) =>
    `/transparencia/servidores?${new URLSearchParams({
      ...(q ? { q } : {}),
      ...(secretaria ? { secretaria } : {}),
      competencia_ano: String(competenciaAno),
      ...(competenciaMes ? { competencia_mes: competenciaMes } : {}),
      ...params,
    })}`;

  return (
    <main className="page-container">
      <div className="page-hero">
        <p style={{ margin: '0 0 6px', fontSize: 13 }}>
          <Link href="/transparencia" style={{ color: 'var(--text-muted)' }}>← Dinheiro público</Link>
        </p>
        <h1>Servidores</h1>
        <p className="page-hero-sub">
          Folha salarial publicada no Portal da Transparência — cargo, secretaria e remuneração de cada competência.
        </p>
      </div>

      <TransparenciaSubnav />

      <FilterBar action="/transparencia/servidores">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Buscar por nome ou cargo…"
          className="field-input"
          style={{ flex: '1 1 240px', minWidth: 0 }}
        />
        <input
          type="text"
          name="secretaria"
          defaultValue={secretaria}
          placeholder="Secretaria"
          className="field-input"
          style={{ width: 'auto' }}
        />
        <select name="competencia_mes" defaultValue={competenciaMes} className="field-select" style={{ width: 'auto' }}>
          {MESES.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
        <select name="competencia_ano" defaultValue={competenciaAno} className="field-select" style={{ width: 'auto' }}>
          {Array.from({ length: anoAtual - ANO_MIN + 1 }, (_, i) => anoAtual - i).map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </FilterBar>

      <SectionBlock
        title={`${total.toLocaleString('pt-BR')} registro${total !== 1 ? 's' : ''} encontrado${total !== 1 ? 's' : ''}`}
        description="Cada linha é um servidor numa competência (mês) — a mesma pessoa aparece uma vez por mês selecionado."
      >
        <TabelaServidores dados={dados} />

        {total > LIMITE && (
          <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'center' }}>
            {pagina > 1 && (
              <Link href={href({ pagina: String(pagina - 1) })} style={{ padding: '6px 16px', borderRadius: 6, background: 'var(--surface-muted)', fontSize: 13 }}>
                ← Anterior
              </Link>
            )}
            <span style={{ padding: '6px 12px', fontSize: 13, color: 'var(--text-muted)' }}>
              Pág. {pagina} de {totalPaginas}
            </span>
            {pagina < totalPaginas && (
              <Link href={href({ pagina: String(pagina + 1) })} style={{ padding: '6px 16px', borderRadius: 6, background: 'var(--surface-muted)', fontSize: 13 }}>
                Próxima →
              </Link>
            )}
          </div>
        )}
      </SectionBlock>
    </main>
  );
}
