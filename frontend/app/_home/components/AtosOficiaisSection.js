import Link from 'next/link';
import SectionBlock from '../../components/SectionBlock';
import DocumentPreview from './DocumentPreview';

export default function AtosOficiaisSection({ documentos }) {
  return (
    <div className="content-stack">
      <SectionBlock
        title="Atos oficiais"
        description="Decretos, leis e portarias publicados pela Prefeitura — do mais novo ao mais antigo."
        aside={<Link href="/legislacao">Ver legislação →</Link>}
      >
        <div className="citizen-list">
          {documentos.length ? (
            documentos.map((documento) => (
              <DocumentPreview key={documento.id} documento={documento} />
            ))
          ) : (
            <p className="empty-state">Nenhum ato oficial encontrado.</p>
          )}
        </div>
      </SectionBlock>
    </div>
  );
}
