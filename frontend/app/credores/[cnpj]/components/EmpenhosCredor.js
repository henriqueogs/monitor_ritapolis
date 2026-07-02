import Link from 'next/link';
import { fetchTransparenciaDespesas } from '../../../lib/api';
import SectionBlock from '../../../components/SectionBlock';
import TabelaEmpenhos from '../../../components/TabelaEmpenhos';

const LIMITE = 25;

function tituloPeriodo(exercicio, porAno) {
  if (exercicio) {return `Empenhos de ${exercicio}`;}
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
