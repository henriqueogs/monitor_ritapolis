import SectionBlock from '../../../components/SectionBlock';
import { formatDate, formatMoney } from '../../../lib/format';

// Portal da Transparência não aceita ?exercicio= (retorna 404) — usa só a base.
const PORTAL_BASE = 'https://pt.ritapolis.mg.gov.br/Tempo_Real_Despesa';

function portalUrl() {
  return PORTAL_BASE;
}

function PortalLink({ label = 'Ver no Portal ↗' }) {
  return (
    <a
      href={portalUrl()}
      target="_blank"
      rel="noopener noreferrer"
      className="availability-badge is-gov origin-badge"
    >
      {label}
    </a>
  );
}

function tipoLabel(tipo) {
  if (!tipo) return 'Empenho';
  const t = String(tipo).toLowerCase();
  if (t.includes('ordinário') || t.includes('ordinario')) return 'Ord.';
  if (t.includes('estimativo')) return 'Est.';
  if (t.includes('global')) return 'Global';
  return tipo;
}

function ResumoEmpenhos({ resumo }) {
  if (!resumo || !resumo.n_empenhos) return null;
  return (
    <div className="document-row-meta" style={{ marginBottom: '16px', gap: '24px' }}>
      <span>
        <strong>{resumo.n_empenhos}</strong> empenho{resumo.n_empenhos !== 1 ? 's' : ''}
      </span>
      {resumo.valor_empenhado != null ? (
        <span>
          Total empenhado: <strong>{formatMoney(resumo.valor_empenhado)}</strong>
        </span>
      ) : null}
      {resumo.primeiro_empenho ? (
        <span>
          Período: {formatDate(resumo.primeiro_empenho)}
          {resumo.ultimo_pagamento ? ` → ${formatDate(resumo.ultimo_pagamento)}` : ''}
        </span>
      ) : null}
    </div>
  );
}

export default function EmpenhoSection({ empenhos: data }) {
  const resumo = data?.resumo || null;
  const empenhos = data?.empenhos || [];

  const portalAside = <PortalLink label="Ver no Portal ↗" />;

  if (!empenhos.length) {
    return (
      <SectionBlock
        title="Empenhos e pagamentos"
        description="Dados do Portal da Transparência — empenhos, liquidações e pagamentos vinculados a este processo."
        aside={<PortalLink label="Abrir Portal ↗" />}
      >
        <p className="empty-state">
          Nenhum empenho vinculado a este processo no Portal da Transparência.
        </p>
      </SectionBlock>
    );
  }

  return (
    <SectionBlock
      title="Empenhos e pagamentos"
      description="Fonte: Portal da Transparência (pt.ritapolis.mg.gov.br). Vinculados por modalidade e número do processo."
      aside={portalAside}
    >
      <ResumoEmpenhos resumo={resumo} />
      <div className="products-table">
        {empenhos.map((emp) => (
          <article key={emp.id} className="product-row">
            <div className="product-row-main">
              <div className="document-row-meta">
                <span>{emp.exercicio_orcamento}</span>
                <span>Empenho {emp.empenho}</span>
                {emp.tipo ? <span>{tipoLabel(emp.tipo)}</span> : null}
                <a
                  href={portalUrl(emp.exercicio_orcamento)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="availability-badge is-gov"
                  title={`Verificar empenho ${emp.empenho} no Portal da Transparência`}
                >
                  ↗ Verificar
                </a>
              </div>
              <h3>{emp.credor_nome || 'Credor não identificado'}</h3>
              {emp.historico ? <p>{emp.historico}</p> : null}
              {emp.credor_cnpj ? (
                <span className="product-source-line">CNPJ: {emp.credor_cnpj}</span>
              ) : null}
            </div>
            <div className="product-row-side">
              <div className="document-row-field">
                <span>Valor</span>
                <strong>{formatMoney(emp.valor)}</strong>
              </div>
              <div className="document-row-field">
                <span>Empenho</span>
                <strong>{formatDate(emp.data_empenho) || '—'}</strong>
              </div>
              {emp.data_liquidacao ? (
                <div className="document-row-field">
                  <span>Liquidação</span>
                  <strong>{formatDate(emp.data_liquidacao)}</strong>
                </div>
              ) : null}
              {emp.data_pagamento ? (
                <div className="document-row-field">
                  <span>Pagamento</span>
                  <strong>{formatDate(emp.data_pagamento)}</strong>
                </div>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </SectionBlock>
  );
}
