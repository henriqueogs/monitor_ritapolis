import DocumentRow from './DocumentRow';

function groupByYear(documentos) {
  return documentos.reduce((groups, documento) => {
    const year = documento.ano || 'Sem ano';
    if (!groups.has(year)) {
      groups.set(year, []);
    }
    groups.get(year).push(documento);
    return groups;
  }, new Map());
}

export default function DocumentList({
  documentos,
  emptyMessage = 'Nenhum documento encontrado.',
  groupedByYear = false
}) {
  if (!documentos.length) {
    return <p className="empty-state">{emptyMessage}</p>;
  }

  if (groupedByYear) {
    const groups = Array.from(groupByYear(documentos).entries());

    return (
      <div className="year-group-list">
        {groups.map(([year, items]) => (
          <section key={year} className="year-group">
            <div className="year-group-head">
              <h3>{year}</h3>
              <span>{items.length} registros nesta pagina</span>
            </div>
            <div className="document-list">
              {items.map((documento) => (
                <DocumentRow key={documento.id} documento={documento} />
              ))}
            </div>
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className="document-list">
      {documentos.map((documento) => (
        <DocumentRow key={documento.id} documento={documento} />
      ))}
    </div>
  );
}
