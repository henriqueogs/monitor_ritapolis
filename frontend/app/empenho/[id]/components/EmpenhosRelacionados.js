import Link from 'next/link';
import SectionBlock from '../../../components/SectionBlock';
import { formatMoney, formatDate } from '../../../lib/format';

function ListaExemplos({ exemplos }) {
  if (!exemplos?.length) {return null;}
  return (
    <div className="simple-table" style={{ marginTop: 10 }}>
      {exemplos.map((e) => (
        <Link
          key={e.id}
          href={`/empenho/${e.id}`}
          className="table-row"
          style={{
            textDecoration: 'none', color: 'inherit',
            display: 'grid', gridTemplateColumns: '92px 110px 1fr 110px', gap: 12, alignItems: 'center',
          }}
        >
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
            {formatDate(e.data_empenho, '—')}
          </span>
          <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{e.empenho}</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {e.historico || '—'}
          </span>
          <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
            {formatMoney(e.valor)}
          </span>
        </Link>
      ))}
    </div>
  );
}

/**
 * Contexto do empenho: outros gastos com o mesmo credor e na mesma categoria
 * no exercício — sempre com o ano explícito (§11.1).
 */
export default function EmpenhosRelacionados({ relacionados, credorNome, categoriaRotulo, credorCnpj, categoriaSlug }) {
  const credor = relacionados?.mesmo_credor_ano;
  const categoria = relacionados?.mesma_categoria_ano;
  if (!credor?.n && !categoria?.n) {return null;}

  return (
    <>
      {credor?.n > 0 && (
        <SectionBlock
          title={`Outros pagamentos a ${credorNome} em ${credor.exercicio}`}
          description={`${credor.n} outro${credor.n !== 1 ? 's' : ''} empenho${credor.n !== 1 ? 's' : ''} somando ${formatMoney(credor.valor_total)} no exercício ${credor.exercicio}.`}
          aside={
            credorCnpj ? (
              <Link href={`/credores/${credorCnpj}`} className="availability-badge is-gov" style={{ textDecoration: 'none' }}>
                Perfil do credor
              </Link>
            ) : null
          }
        >
          <ListaExemplos exemplos={credor.exemplos} />
        </SectionBlock>
      )}

      {categoria?.n > 0 && (
        <SectionBlock
          title={`Outros gastos com ${categoriaRotulo} em ${categoria.exercicio}`}
          description={`${categoria.n} empenho${categoria.n !== 1 ? 's' : ''} da mesma categoria somando ${formatMoney(categoria.valor_total)} em ${categoria.exercicio}.`}
          aside={
            categoriaSlug ? (
              <Link
                href={`/transparencia/empenhos?categoria=${categoriaSlug}`}
                className="availability-badge is-gov"
                style={{ textDecoration: 'none' }}
              >
                Ver todos
              </Link>
            ) : null
          }
        >
          <ListaExemplos exemplos={categoria.exemplos} />
        </SectionBlock>
      )}
    </>
  );
}
