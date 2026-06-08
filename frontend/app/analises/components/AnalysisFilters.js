import FilterBar from '../../components/FilterBar';

export default function AnalysisFilters({ filters }) {
  return (
    <FilterBar action="/analises">
      <select name="tipo" defaultValue={filters.tipo} className="field-select">
        <option value="">Todos os tipos</option>
        <option value="edital">Licitações/Editais</option>
        <option value="lei">Leis</option>
        <option value="decreto">Decretos</option>
        <option value="portaria">Portarias</option>
        <option value="contrato">Contratos</option>
      </select>
      <select name="limite" defaultValue={filters.limite} className="field-select">
        <option value="25">25 resultados</option>
        <option value="50">50 resultados</option>
        <option value="100">100 resultados</option>
      </select>
    </FilterBar>
  );
}
