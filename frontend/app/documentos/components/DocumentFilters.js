import FilterBar from '../../components/FilterBar';
import SearchInput from '../../components/SearchInput';

export default function DocumentFilters({ filters, action = '/acervo' }) {
  return (
    <FilterBar action={action}>
      <SearchInput compact defaultValue={filters.q} />
      <select name="fonte" defaultValue={filters.fonte} className="field-select">
        <option value="">Todas as fontes</option>
        <option value="site_prefeitura">Prefeitura</option>
      </select>
      <select name="tipo" defaultValue={filters.tipo} className="field-select">
        <option value="">Todos os tipos</option>
        <option value="edital">Licitacao/Edital</option>
        <option value="lei">Lei</option>
        <option value="portaria">Portaria</option>
        <option value="contrato">Contrato</option>
        <option value="decreto">Decreto</option>
      </select>
      <input name="ano" defaultValue={filters.ano} className="field-input" placeholder="Ano" />
      <select name="qualidade" defaultValue={filters.qualidade} className="field-select" title="Filtrar por problema de coleta">
        <option value="">Todos os registros</option>
        <option value="sem_pdf">Sem arquivo oficial</option>
        <option value="erro_pdf">PDF não legível</option>
        <option value="sem_data">Data de publicação ausente</option>
      </select>
    </FilterBar>
  );
}
