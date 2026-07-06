import Link from 'next/link';
import SectionBlock from '../../components/SectionBlock';
import { formatMoney, formatDate } from '../../lib/format';

const MAX_LINHAS_VISIVEIS = 15;

/**
 * Fila de pagamentos: empenhos liquidados (a Prefeitura já reconheceu o dever
 * de pagar) que ainda não têm pagamento registrado — quem está esperando
 * receber, mais antigos primeiro.
 */
export default function FilaPagamentos({ fila }) {
  if (!fila?.resumo?.n_total) return null;

  const { resumo, itens } = fila;
  const visiveis = itens.slice(0, MAX_LINHAS_VISIVEIS);

  return (
    <SectionBlock
      title="Fila de pagamentos — quem está esperando receber"
      description={`${resumo.n_total.toLocaleString('pt-BR')} empenhos liquidados aguardando pagamento, somando ${formatMoney(resumo.valor_total)}. Liquidado = serviço/produto entregue e conferido; falta só o pagamento. Situação conforme a última coleta do Portal da Transparência.`}
    >
      <div className="products-table">
        {visiveis.map((item) => (
          <article key={item.id} className="product-row">
            <div className="product-row-main">
              <div className="document-row-meta">
                <span>{item.exercicio_orcamento}</span>
                <Link href={`/empenho/${item.id}`} style={{ fontWeight: 600 }}>
                  Empenho {item.empenho}
                </Link>
                {item.funcao ? (
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {String(item.funcao).split(' - ').slice(1).join(' - ') || item.funcao}
                  </span>
                ) : null}
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '0.9rem' }}>{item.credor_nome}</p>
              <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Liquidado em {formatDate(item.data_liquidacao)} — aguardando pagamento
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{formatMoney(item.valor)}</strong>
            </div>
          </article>
        ))}
      </div>
      {itens.length > MAX_LINHAS_VISIVEIS ? (
        <p style={{ marginTop: 10, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          Mostrando os {MAX_LINHAS_VISIVEIS} mais antigos de {resumo.n_total.toLocaleString('pt-BR')}.
        </p>
      ) : null}
    </SectionBlock>
  );
}
