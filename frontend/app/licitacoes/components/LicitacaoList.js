import LicitacaoRow from './LicitacaoRow';

export default function LicitacaoList({ itens }) {
  if (!itens.length) {
    return <p className="empty-state">Nenhuma licitacao encontrada com esses filtros.</p>;
  }

  return (
    <div className="licitacao-list">
      {itens.map((item) => (
        <LicitacaoRow key={item.id} item={item} />
      ))}
    </div>
  );
}
