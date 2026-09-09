import FilterBar from '../../../components/FilterBar';

const OPCOES_TIPO = [
  { value: '', label: 'Todos os tipos' },
  { value: 'projeto_lei', label: 'Projeto de Lei' },
  { value: 'projeto_lei_complementar', label: 'Projeto de Lei Complementar' },
  { value: 'projeto_lei_substitutivo', label: 'Projeto de Lei Substitutivo' },
  { value: 'projeto_resolucao', label: 'Projeto de Resolução' },
  { value: 'projeto_emenda_lei_organica', label: 'Projeto de Emenda à Lei Orgânica' },
];

export default function ProjetosFilters({ filters }) {
  return (
    <FilterBar action="/legislacao/camara/projetos">
      <select name="tipo" defaultValue={filters.tipo} className="field-select">
        {OPCOES_TIPO.map((opcao) => (
          <option key={opcao.value} value={opcao.value}>{opcao.label}</option>
        ))}
      </select>
      <input name="exercicio" defaultValue={filters.exercicio} className="field-input" placeholder="Exercício (ano)" />
    </FilterBar>
  );
}
