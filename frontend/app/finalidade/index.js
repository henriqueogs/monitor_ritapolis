import Link from 'next/link';
import { fetchTransparenciaResumo } from '../lib/api';
import { formatMoney } from '../lib/format';
import SectionBlock from '../components/SectionBlock';
import FinalidadeBadge from '../components/FinalidadeBadge';

export const metadata = {
  title: 'Finalidade dos empenhos',
  description: 'Classificacao dos empenhos por finalidade: licitacao, diaria, entidade, folha, auxilio e servicos.',
};

const FINALIDADES = {
  ordem_pagamento: { rotulo: 'Ordem de pagamento', tom: 'neutro', descricao: 'Pagamento de uma despesa ja empenhada ou movimento extraorcamentario.' },
  licitacao: { rotulo: 'Licitação', tom: 'gov', descricao: 'Empenhos vinculados a processo licitatorio, modalidade ou documento municipal.' },
  diaria_servidor: { rotulo: 'Diária', tom: 'servidor', descricao: 'Diarias e deslocamentos pagos a servidor ou agente identificado pelo portal.' },
  transferencia_entidade: { rotulo: 'Entidade', tom: 'entidade', descricao: 'Repasses, subvencoes, termos de fomento ou colaboracao com entidades.' },
  pessoal_encargos: { rotulo: 'Folha', tom: 'pessoal', descricao: 'Folha, vencimentos, encargos patronais e obrigacoes de pessoal.' },
  auxilio_pf: { rotulo: 'Auxílio', tom: 'auxilio', descricao: 'Auxilios e apoios financeiros a pessoa fisica, sem identificar CPF publico.' },
  servico_pf: { rotulo: 'Serviço PF', tom: 'servico', descricao: 'Contratacao de servicos de pessoa fisica.' },
  servico_pj_sem_licitacao: { rotulo: 'Serviço PJ', tom: 'servico', descricao: 'Servicos de pessoa juridica sem licitacao vinculada na base.' },
  investimento: { rotulo: 'Investimento', tom: 'investimento', descricao: 'Obras, equipamentos e outros itens do grupo de investimento.' },
  outros: { rotulo: 'Outros', tom: 'neutro', descricao: 'Empenhos sem regra especifica suficiente para outra finalidade.' },
};

function finalidadePublica(row) {
  const meta = FINALIDADES[row.classe_principal] || FINALIDADES.outros;
  return {
    classe: row.classe_principal,
    rotulo: meta.rotulo,
    tom: meta.tom,
    descricao: meta.descricao,
    n: row.n || 0,
    valor: row.valor || 0,
  };
}

export default async function FinalidadePage() {
  const dados = await fetchTransparenciaResumo({ periodo: 'todos' });
  const finalidades = (dados?.finalidadesEmpenho || []).map(finalidadePublica);
  const valorTotal = finalidades.reduce((acc, item) => acc + Number(item.valor || 0), 0);
  const totalEmpenhos = finalidades.reduce((acc, item) => acc + Number(item.n || 0), 0);

  return (
    <main className="page-container">
      <div className="page-title">
        <div>
          <h1>Finalidade dos empenhos</h1>
          <p>
            Uma camada auditavel sobre o registro bruto do Portal da Transparencia:
            separa licitacao, diaria, entidade, folha, auxilio, servicos e ordens de pagamento.
          </p>
        </div>
      </div>

      <div className="admin-metric-grid" style={{ marginBottom: 24 }}>
        <div className="admin-metric-card">
          <span>Empenhos classificados</span>
          <strong>{totalEmpenhos.toLocaleString('pt-BR')}</strong>
        </div>
        <div className="admin-metric-card">
          <span>Valor movimentado</span>
          <strong>{formatMoney(valorTotal)}</strong>
        </div>
        <div className="admin-metric-card">
          <span>Classes</span>
          <strong>{finalidades.length}</strong>
        </div>
      </div>

      <SectionBlock
        title="Composicao por finalidade"
        description="Clique em uma linha para ver os empenhos classificados naquela finalidade; o link de credores mostra quem recebeu dentro da mesma classe."
      >
        <div className="products-table">
          {finalidades.map((item) => {
            const pct = valorTotal ? Math.round((item.valor / valorTotal) * 100) : 0;
            return (
              <article key={item.classe} className="product-row">
                <div className="product-row-main">
                  <div className="document-row-meta">
                    <FinalidadeBadge finalidade={item} />
                    <span>{item.n.toLocaleString('pt-BR')} empenhos</span>
                    <span>{pct}% do valor</span>
                  </div>
                  <h3 style={{ margin: '4px 0', fontSize: '1rem' }}>{item.rotulo}</h3>
                  <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.88rem' }}>{item.descricao}</p>
                  <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Link href={`/transparencia/empenhos?finalidade=${item.classe}`} className="availability-badge is-gov" style={{ textDecoration: 'none' }}>
                      Ver empenhos
                    </Link>
                    <Link href={`/credores?finalidade=${item.classe}`} className="availability-badge" style={{ textDecoration: 'none' }}>
                      Ver credores
                    </Link>
                  </div>
                </div>
                <div className="product-row-side">
                  <div className="document-row-field">
                    <span>Valor</span>
                    <strong>{formatMoney(item.valor)}</strong>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </SectionBlock>
    </main>
  );
}
