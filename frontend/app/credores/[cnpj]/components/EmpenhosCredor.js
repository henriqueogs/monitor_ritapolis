import Link from 'next/link';
import { fetchTransparenciaDespesas } from '../../../lib/api';
import SectionBlock from '../../../components/SectionBlock';
import TabelaEmpenhos from '../../../components/TabelaEmpenhos';
import SearchInput from '../../../components/SearchInput';
import { FINALIDADE_OPCOES } from '../../../lib/finalidades';

const LIMITE = 25;
const FINALIDADES = FINALIDADE_OPCOES;

function tituloPeriodo({ exercicio, mandato, periodoTodos, porAno }) {
  if (exercicio) {return `Empenhos de ${exercicio}`;}
  if (mandato) {return `Empenhos do mandato ${mandato}-${mandato + 3}`;}
  if (periodoTodos) {return 'Todos os empenhos';}
  const anos = (porAno || []).map((r) => r.ano).filter(Boolean);
  if (!anos.length) {return 'Todos os empenhos';}
  const min = Math.min(...anos);
  const max = Math.max(...anos);
  return min === max ? `Todos os empenhos (${min})` : `Todos os empenhos (${min}–${max})`;
}

/**
 * Lista completa e paginada de empenhos do credor, com filtro por exercício.
 * Server component — paginação via query params, como em /credores.
 */
export default async function EmpenhosCredor({ cnpj, porAno, pagina = 1, exercicio, mandato, periodoTodos, q, finalidade }) {
  const resultado = await fetchTransparenciaDespesas({
    credor_cnpj: cnpj,
    exercicio,
    mandato,
    finalidade: finalidade || undefined,
    q: q || undefined,
    pagina,
    limite: LIMITE,
  });
  const dados = resultado?.dados || [];
  const total = resultado?.total || 0;
  const totalPaginas = Math.max(1, Math.ceil(total / LIMITE));
  const anosDisponiveis = (porAno || []).map((r) => r.ano).sort((a, b) => b - a);
  const periodoParams = {
    ...(exercicio ? { exercicio: String(exercicio) } : {}),
    ...(mandato ? { mandato: String(mandato) } : {}),
    ...(periodoTodos ? { periodo: 'todos' } : {}),
  };

  const hrefPagina = (p, ex = exercicio) =>
    `/credores/${cnpj}?${new URLSearchParams({
      ...(ex ? { exercicio: String(ex) } : periodoParams),
      ...(q ? { q } : {}),
      ...(finalidade ? { finalidade } : {}),
      ...(p > 1 ? { pagina: String(p) } : {}),
    })}#empenhos`;

  return (
    <div id="empenhos">
      <SectionBlock
        title={tituloPeriodo({ exercicio, mandato, periodoTodos, porAno })}
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

        <form method="get" action={`/credores/${cnpj}`} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {exercicio ? <input type="hidden" name="exercicio" value={exercicio} /> : null}
          {mandato ? <input type="hidden" name="mandato" value={mandato} /> : null}
          {periodoTodos ? <input type="hidden" name="periodo" value="todos" /> : null}
          <SearchInput name="q" defaultValue={q || ''} placeholder="Buscar na descrição dos empenhos…" compact />
          <select
            name="finalidade"
            defaultValue={finalidade || ''}
            style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 14, background: 'var(--surface)' }}
          >
            <option value="">Todas as finalidades</option>
            {FINALIDADES.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </form>

        <TabelaEmpenhos dados={dados} />

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
