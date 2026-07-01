import Link from 'next/link';
import { fetchAnexo } from '../../lib/api';
import { formatDate } from '../../lib/format';
import styles from '../../documento/[id]/styles.module.css';

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

export default async function AnexoPage({ params }) {
  const anexo = await fetchAnexo(params.id);
  const pai = anexo.documento_pai;
  const resumo = anexo.resumo_ai?.dados || null;
  const fatos = anexo.fatos || [];

  return (
    <main className="page-container">
      <section className={styles.aiCard}>
        <div className={styles.aiHeaderSpread}>
          <div>
            <p className={styles.aiMeta}>Arquivo vinculado</p>
            <h1 className={styles.aiTitleLarge}>{anexo.nome || `Anexo ${anexo.id}`}</h1>
          </div>
          <span className={`${styles.aiMeta} admin-only`}>{statusLabel(anexo.status_extracao)}</span>
        </div>

        <p className={`${styles.aiNotice} ${styles.aiNoticeCompact}`}>
          Este arquivo faz parte da publicacao{' '}
          <Link href={`/documento/${pai.id}`}>{pai.titulo || `Documento ${pai.id}`}</Link>.
          Use o arquivo original para conferir a fonte.
        </p>

        <div className={styles.externalSourceFacts}>
          <div>
            <dt>Publicação pai</dt>
            <dd>
              <Link href={`/documento/${pai.id}`}>#{pai.id}</Link>
            </dd>
          </div>
          <div>
            <dt>Ano</dt>
            <dd>{pai.ano || '-'}</dd>
          </div>
          <div>
            <dt>Publicado</dt>
            <dd>{pai.data_publicacao ? formatDate(pai.data_publicacao) : '-'}</dd>
          </div>
          <div>
            <dt>Arquivo</dt>
            <dd>{anexo.url ? 'Disponivel' : 'Nao informado'}</dd>
          </div>
        </div>

        <div className={styles.attachmentActions}>
          {anexo.url ? (
            <a href={anexo.url} target="_blank" rel="noopener noreferrer">
              Abrir arquivo original
            </a>
          ) : null}
          <Link href={`/documento/${pai.id}`}>Voltar ao documento pai</Link>
        </div>
      </section>

      {anexo.status_extracao === 'tecnico_visual' ? (
        <section className={styles.aiCard}>
          <div className={styles.aiHeader}>
            <h2 className={styles.aiTitle}>Arquivo tecnico visual</h2>
          </div>
          <p>
            Este anexo parece ser mapa, grafico ou prancha tecnica. A plataforma preserva o arquivo
            original e evita transformar rotulos soltos do desenho em texto corrido.
          </p>
        </section>
      ) : null}

      {resumo && anexo.status_extracao !== 'tecnico_visual' ? (
        <section className={styles.aiCard}>
          <div className={styles.aiHeader}>
            <h2 className={styles.aiTitle}>Resumo do anexo</h2>
          </div>
          <p>{resumo.resumo_curto}</p>
          {resumo.pontos_relevantes?.length ? (
            <div className={`${styles.factPills} admin-only`}>
              {resumo.pontos_relevantes.map((item, index) => (
                <span key={`${item.tipo}-${item.subtipo}-${index}`}>
                  {item.tipo}.{item.subtipo}
                  {item.quantidade ? `: ${item.quantidade} ${item.unidade || ''}` : ''}
                </span>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {fatos.length ? (
        <section className={`${styles.aiCard} admin-only`}>
          <div className={styles.aiHeaderSpread}>
            <h2 className={styles.aiTitle}>Fatos extraídos</h2>
            <span className={styles.aiMeta}>{fatos.length} fato{fatos.length === 1 ? '' : 's'}</span>
          </div>
          <div className={styles.attachmentList}>
            {fatos.map((fato) => (
              <article key={fato.id} className={styles.attachmentRow}>
                <div className={styles.attachmentMain}>
                  <div className={styles.externalSourceMeta}>
                    <span>{fato.tipo}</span>
                    {fato.subtipo ? <span>{fato.subtipo}</span> : null}
                    {fato.confianca ? <span>confiança {Math.round(fato.confianca * 100)}%</span> : null}
                  </div>
                  <h3>{fato.descricao}</h3>
                  {fato.trecho_fonte ? <p>{fato.trecho_fonte}</p> : null}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {anexo.texto_completo ? (
        <section className={`${styles.aiCard} admin-only`}>
          <div className={styles.aiHeader}>
            <h2 className={styles.aiTitle}>Texto extraído</h2>
          </div>
          <pre className={styles.documentText}>{anexo.texto_completo.slice(0, 12000)}</pre>
        </section>
      ) : null}
    </main>
  );
}
