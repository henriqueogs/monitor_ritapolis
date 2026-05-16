import Link from 'next/link';
import AiBatchSummaryAction from '../../components/AiBatchSummaryAction';
import SectionBlock from '../../components/SectionBlock';

export default function BatchSummaryPanel({ filters, pendingTotal }) {
  return (
    <SectionBlock
      title="Aumentar cobertura pela interface"
      description="Enfileire documentos pendentes usando os filtros atuais. A geracao acontece em segundo plano."
      aside={<Link href="/analises">Ver analises geradas</Link>}
    >
      <AiBatchSummaryAction filters={filters} pendingTotal={pendingTotal} />
    </SectionBlock>
  );
}
