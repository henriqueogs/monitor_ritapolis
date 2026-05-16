import SectionBlock from '../../components/SectionBlock';

export default function ProvidersPanel({ providerRows }) {
  return (
    <SectionBlock
      title="Providers e modelos"
      description="Distribuicao dos resumos existentes por provider, modelo e status."
    >
      {providerRows.length ? (
        <div className="simple-table">
          {providerRows.map((row) => (
            <div key={`${row.provider}-${row.modelo}-${row.status}`} className="table-row table-row-stacked">
              <div>
                <strong>{row.provider}</strong>
                <p>{row.modelo}</p>
              </div>
              <span>
                {row.status} - {row.total}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="empty-state">Nenhum resumo registrado para os filtros atuais.</p>
      )}
    </SectionBlock>
  );
}
