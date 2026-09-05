import FilterBar from '../../components/FilterBar';
import SearchInput from '../../components/SearchInput';

// Tipos que a pagina de Legislacao cobre -- mesma lista usada no backend
// (src/coletores/site-prefeitura-legislacao.js) pra restringir a vista.
export const TIPOS_LEGISLACAO = [
  'decreto', 'lei_ordinaria', 'lei_complementar', 'portaria', 'resolucao',
  'instrucao_normativa', 'lei_organica', 'ata', 'regimento_interno',
  'estatuto', 'ata_comissao', 'projeto_lei', 'lei', 'deliberacao',
  'decreto_legislativo', 'portaria_legislativo', 'projeto_lei_complementar', 'oficio',
];

const OPCOES_TIPO = [
  { value: '', label: 'Todos os tipos' },
  { value: 'decreto', label: 'Decreto' },
  { value: 'lei_ordinaria', label: 'Lei Ordinária' },
  { value: 'lei_complementar', label: 'Lei Complementar' },
  { value: 'portaria', label: 'Portaria' },
  { value: 'resolucao', label: 'Resolução' },
  { value: 'instrucao_normativa', label: 'Instrução Normativa' },
];

export default function LegislacaoFilters({ filters }) {
  return (
    <FilterBar action="/legislacao">
      <SearchInput compact defaultValue={filters.q} placeholder="Buscar por numero, ementa ou palavra-chave" />
      <select name="tipo" defaultValue={filters.tipo} className="field-select">
        {OPCOES_TIPO.map((opcao) => (
          <option key={opcao.value} value={opcao.value}>{opcao.label}</option>
        ))}
      </select>
      <input name="ano" defaultValue={filters.ano} className="field-input" placeholder="Ano" />
    </FilterBar>
  );
}
