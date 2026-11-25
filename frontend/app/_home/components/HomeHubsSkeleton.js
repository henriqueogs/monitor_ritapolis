import ModulosArea from '../../components/ModulosArea';

// Mesma geometria das áreas reais (os módulos não dependem de fetch);
// só os números do cabeçalho chegam depois, então não pisca layout.
export default function HomeHubsSkeleton() {
  return (
    <div aria-busy="true">
      <ModulosArea areaId="dinheiro" />
      <ModulosArea areaId="atos" />
    </div>
  );
}
