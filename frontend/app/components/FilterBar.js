export default function FilterBar({ children, action }) {
  return (
    <form action={action} className="filterbar">
      {children}
      <div className="filter-actions">
        <button type="submit" className="button button-primary">
          Aplicar
        </button>
      </div>
    </form>
  );
}
