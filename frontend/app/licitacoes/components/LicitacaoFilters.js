import FilterBar from '../../components/FilterBar';
import SearchInput from '../../components/SearchInput';

export default function LicitacaoFilters({ filters }) {
  return (
    <FilterBar action="/licitacoes">
      <SearchInput compact defaultValue={filters.q} placeholder="Buscar por numero, modalidade ou objeto" />
      <select name="fonte" defaultValue={filters.fonte} className="field-select">
        <option value="">Todas as fontes</option>
        <option value="site_prefeitura">Prefeitura</option>
        <option value="camara">Camara</option>
      </select>
      <input name="ano" defaultValue={filters.ano} className="field-input" placeholder="Ano" />
      <select name="status" defaultValue={filters.status} className="field-select">
        <option value="">Todos os status</option>
        <option value="aberta">Aberta</option>
        <option value="homologada">Homologada</option>
        <option value="deserta">Deserta</option>
        <option value="ok">Coletado com sucesso</option>
      </select>
    </FilterBar>
  );
}
