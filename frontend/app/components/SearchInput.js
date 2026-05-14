export default function SearchInput({
  name = 'q',
  defaultValue = '',
  placeholder = 'Buscar por numero, orgao, objeto ou termo',
  buttonLabel = 'Buscar',
  compact = false
}) {
  return (
    <div className={`searchbar${compact ? ' searchbar-compact' : ''}`}>
      <input
        type="search"
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="search-input"
      />
      <button type="submit" className="button button-primary">
        {buttonLabel}
      </button>
    </div>
  );
}
