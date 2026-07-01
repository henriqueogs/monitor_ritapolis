import Link from 'next/link';
import styles from '../styles.module.css';

function statusLabel(status) {
  const labels = {
    ok: 'conteudo legivel',
    pendente: 'pendente',
    requer_ocr: 'aguarda OCR',
    tecnico_visual: 'arquivo tecnico visual',
    erro_pdf: 'erro na leitura',
    ignorado_sem_texto_util: 'sem conteudo util',
  };
  return labels[status] || status || 'sem status';
}

function resumoCurto(anexo) {
  return anexo.resumo_ai?.dados?.resumo_curto || null;
}

export default function AttachmentsSection({ documento }) {
  const anexos = documento.anexos || [];
  const fatos = documento.fatos || [];
  const fatosPorAnexo = new Map();

  fatos.forEach((fato) => {
    if (!fato.anexo_id) {
      return;
    }
    const lista = fatosPorAnexo.get(fato.anexo_id) || [];
    lista.push(fato);
    fatosPorAnexo.set(fato.anexo_id, lista);
  });

  if (!anexos.length) {
    return null;
  }

  return (
    <section className={styles.aiCard}>
      <div className={styles.aiHeaderSpread}>
        <div>
          <p className={styles.aiMeta}>Arquivos vinculados</p>
          <h2 className={styles.aiTitleLarge}>Anexos desta publicacao</h2>
        </div>
        <span className={styles.aiMeta}>{anexos.length} anexo{anexos.length === 1 ? '' : 's'}</span>
      </div>

      <p className={`${styles.aiNotice} ${styles.aiNoticeCompact}`}>
        Estes anexos fazem parte da mesma publicacao. Abra o anexo para conferir o arquivo original e a leitura disponivel.
      </p>

      <div className={styles.attachmentList}>
        {anexos.map((anexo) => {
          const fatosAnexo = fatosPorAnexo.get(anexo.id) || [];
          return (
            <article key={anexo.id} className={styles.attachmentRow}>
              <div className={styles.attachmentMain}>
                <div className={styles.externalSourceMeta}>
                  <span>{anexo.tipo || 'anexo'}</span>
                  <span className="admin-only">{statusLabel(anexo.status_extracao)}</span>
                  {anexo.paginas ? <span className="admin-only">{anexo.paginas} pag.</span> : null}
                  {anexo.resumo_ai ? <span className="admin-only">analise automatica</span> : null}
                </div>
                <h3>
                  <Link href={`/anexo/${anexo.id}`}>{anexo.nome || `Anexo ${anexo.id}`}</Link>
                </h3>
                {anexo.status_extracao === 'tecnico_visual' ? (
                  <p>
                    Mapa, grafico ou prancha tecnica. Consulte o arquivo original; a leitura em texto corrido
                    pode omitir relacoes visuais importantes.
                  </p>
                ) : resumoCurto(anexo) ? <p>{resumoCurto(anexo)}</p> : null}
                {fatosAnexo.length ? (
                  <div className={`${styles.factPills} admin-only`}>
                    {fatosAnexo.slice(0, 4).map((fato) => (
                      <span key={fato.id}>
                        {fato.tipo}.{fato.subtipo}
                        {fato.quantidade ? `: ${fato.quantidade} ${fato.unidade || ''}` : ''}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className={styles.externalSourceSide}>
                <Link href={`/anexo/${anexo.id}`}>Abrir anexo</Link>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
