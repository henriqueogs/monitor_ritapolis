import FilterBar from '../../components/FilterBar';

export default function IaFilters({ filters, years, types }) {
  return (
    <FilterBar action="/admin/ia">
      <select name="ano" defaultValue={filters.ano} className="field-select">
        <option value="">Todos os anos</option>
        {years.map((ano) => (
          <option key={ano} value={ano}>
            {ano}
          </option>
        ))}
      </select>
      <select name="tipo" defaultValue={filters.tipo} className="field-select">
        <option value="">Todos os tipos</option>
        {types.map((tipo) => (
          <option key={tipo} value={tipo}>
            {tipo}
          </option>
        ))}
      </select>
      <select name="fonte" defaultValue={filters.fonte} className="field-select">
        <option value="">Todas as fontes</option>
        <option value="site_prefeitura">Prefeitura</option>
        <option value="camara">Camara</option>
      </select>
      <select name="status_job" defaultValue={filters.status_job} className="field-select">
        <option value="">Todos os jobs</option>
        <option value="pendente">Pendentes</option>
        <option value="processando">Processando</option>
        <option value="ok">Concluidos</option>
        <option value="erro">Com erro</option>
      </select>
    </FilterBar>
  );
}
