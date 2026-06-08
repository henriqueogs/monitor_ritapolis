import Link from 'next/link';
import SectionBlock from '../../../components/SectionBlock';
import styles from '../styles.module.css';

export default function LicitationGroup({ grupo }) {
  if (!grupo?.documentos?.length) return null;

  const outros = grupo.documentos.filter((item) => !item.eh_atual);

  return (
    <SectionBlock
      title="Processo e publicacoes relacionadas"
      description={`Processo ${grupo.processo_exibicao || grupo.processo_chave} / ${grupo.ano}. Esta licitacao faz parte de um grupo com ${grupo.total_documentos} registro(s).`}
    >
      <div className={styles.groupSummary}>
        <span>Papel desta pagina: {grupo.papel_atual_nome || grupo.papel_atual}</span>
        {grupo.documento_canonico_id ? (
          <span>
            Registro canonico:{' '}
            <Link href={`/documento/${grupo.documento_canonico_id}`}>#{grupo.documento_canonico_id}</Link>
          </span>
        ) : null}
      </div>

      {outros.length ? (
        <div className={styles.groupList}>
          {outros.map((item) => (
            <article key={item.documento_id} className={styles.groupRow}>
              <div>
                <div className={styles.externalSourceMeta}>
                  <span>{item.papel_nome}</span>
                  <span>{item.fonte_nome}</span>
                  {item.eh_canonico ? <span>Canonico</span> : null}
                </div>
                <h3>
                  <Link href={`/documento/${item.documento_id}`}>{item.titulo}</Link>
                </h3>
                <p>
                  {item.numero ? `Processo ${item.numero}` : 'Sem numero'} ·{' '}
                  {item.data_publicacao || 'Sem data'}
                </p>
              </div>
              <Link href={`/documento/${item.documento_id}`} className={styles.groupLink}>
                Abrir
              </Link>
            </article>
          ))}
        </div>
      ) : (
        <p className="empty-state">Nenhuma outra publicacao relacionada neste processo.</p>
      )}
    </SectionBlock>
  );
}
