import FilterBar from '../../components/FilterBar';
import SearchInput from '../../components/SearchInput';

const CATEGORIAS = [
  'Alimentação',
  'Saúde',
  'Educação',
  'Obras e Infraestrutura',
  'Serviços',
  'Equipamentos e Materiais',
  'Outros'
];

export default function LicitacaoFilters({ filters }) {
  return (
    <FilterBar action="/licitacoes">
      <input type="hidden" name="ano" defaultValue={filters.ano} />
      <SearchInput compact defaultValue={filters.q} placeholder="Buscar por numero, modalidade ou objeto" />
      <select name="categoria" defaultValue={filters.categoria} className="field-select" title="Classificação automática por palavras-chave no objeto da licitação">
        <option value="">Todas as categorias</option>
        {CATEGORIAS.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
      <select name="fonte" defaultValue={filters.fonte} className="field-select">
        <option value="">Todas as fontes</option>
        <option value="site_prefeitura">Prefeitura</option>
        <option value="camara">Camara</option>
      </select>
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
