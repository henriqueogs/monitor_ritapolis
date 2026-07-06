import SectionBlock from '../../components/SectionBlock';
import { formatMoney } from '../../lib/format';

/**
 * Receita prevista (LOA) por exercício, cruzada com o empenhado — sempre com
 * o exercício explícito em cada linha.
 */
export default function ComposicaoReceita({ receitasPorAno, porAno }) {
  if (!receitasPorAno?.length) return null;

  return (
    <SectionBlock
      title="Composição da receita orçamentária"
      description="Receitas correntes (impostos, taxas, transferências federais/estaduais) e receitas de capital (alienações, transferências de capital). Fonte: LOA aprovada pela Câmara Municipal."
    >
      <dl className="keyvalue-list">
        {receitasPorAno.map((r) => {
          const despeRow = (porAno || []).find((d) => d.exercicio === r.exercicio);
          // Empenhado (competência), sem ordens de pagamento — ver TabelaExercicios
          const empenhado = despeRow?.valor_empenhado ?? despeRow?.valor_total;
          const execucao =
            empenhado && r.valor_total_previsto
              ? Math.round((empenhado / r.valor_total_previsto) * 100)
              : null;
          return (
            <div key={r.exercicio} className="keyvalue-row">
              <dt style={{ fontWeight: 600 }}>{r.exercicio}</dt>
              <dd>
                <strong>{formatMoney(r.valor_total_previsto)}</strong>
                <span style={{ marginLeft: 12, color: 'var(--text-muted)', fontSize: '0.83rem' }}>receita prevista</span>
                {empenhado != null && (
                  <span style={{ marginLeft: 12, color: 'var(--text-secondary)', fontSize: '0.83rem' }}>
                    · {formatMoney(empenhado)} empenhado
                    {execucao != null && (
                      <span style={{ marginLeft: 6, color: execucao > 95 ? 'var(--warning)' : 'var(--success)', fontWeight: 600 }}>
                        ({execucao}%)
                      </span>
                    )}
                  </span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
      <p style={{ marginTop: 12, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
        * Receita prevista = orçamento aprovado (LOA). Despesa executada = empenhos registrados no Portal da
        Transparência. Ano de 2023 pode estar incompleto caso o período inicial de coleta não cubra todo o exercício.
      </p>
    </SectionBlock>
  );
}
