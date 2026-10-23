import { formatDate, formatMoney } from '../../../lib/format';
import { isGenericPrefeituraSourcePage } from '../../../lib/source-links';
import { linksDaEvidencia } from '../../../../lib/alerta-revisao';
import styles from './styles.module.css';

function rotuloLink(link) {
  if (link.tipo === 'origem' && isGenericPrefeituraSourcePage(link.url)) {
    return 'Página da fonte (listagem geral da Prefeitura)';
  }
  return link.rotulo;
}

function Links({ links }) {
  if (!links.length) {
    return <p className={styles.semFonte}>Sem link para a fonte oficial.</p>;
  }
  return (
    <div className={styles.links}>
      {links.map((link) => (
        <a
          key={link.url}
          href={link.url}
          target={link.tipo === 'interno' ? undefined : '_blank'}
          rel={link.tipo === 'interno' ? undefined : 'noreferrer'}
        >
          {rotuloLink(link)}
        </a>
      ))}
    </div>
  );
}

function Fato({ e }) {
  const partes = [
    e.fato_descricao || e.metadados?.descricao,
    e.fato_quantidade != null ? `${e.fato_quantidade} ${e.fato_unidade || ''}`.trim() : null,
    e.fato_valor != null ? formatMoney(e.fato_valor) : null,
    e.metadados?.credor_nome,
    e.metadados?.valor != null ? formatMoney(e.metadados.valor) : null,
  ].filter(Boolean);
  if (!partes.length) return null;
  return <p className={styles.fato}>{partes.join(' · ')}</p>;
}

export default function EvidenciasLista({ evidencias = [], documentos = [] }) {
  const documentosPorId = new Map(documentos.map((d) => [Number(d.documento_id), d]));
  const comEvidencia = new Set(evidencias.map((e) => Number(e.documento_id)));
  const soDocumentos = documentos.filter((d) => !comEvidencia.has(Number(d.documento_id)));

  return (
    <section className={styles.section}>
      <h2>Evidências ({evidencias.length})</h2>
      {!evidencias.length && !documentos.length ? (
        <p className={styles.semFonte}>Nenhuma evidência nem documento vinculado.</p>
      ) : null}
      <ol className={styles.evidencias}>
        {evidencias.map((e) => (
          <li key={e.id}>
            <div className={styles.evidenciaTopo}>
              <strong>{e.documento_titulo || e.anexo_nome || `Evidência #${e.id}`}</strong>
              <span className={styles.muted}>
                {[e.documento_tipo, e.documento_data_publicacao ? formatDate(e.documento_data_publicacao) : null, e.anexo_nome, e.papel]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </div>
            <Fato e={e} />
            {e.trecho_fonte ? <blockquote className={styles.trecho}>{e.trecho_fonte}</blockquote> : null}
            <Links links={linksDaEvidencia(e, documentosPorId)} />
          </li>
        ))}
      </ol>
      {soDocumentos.length ? (
        <>
          <h3>Documentos vinculados sem evidência específica</h3>
          <ol className={styles.evidencias}>
            {soDocumentos.map((d) => (
              <li key={d.documento_id}>
                <div className={styles.evidenciaTopo}>
                  <strong>{d.titulo}</strong>
                  <span className={styles.muted}>
                    {[d.tipo, d.data_publicacao ? formatDate(d.data_publicacao) : null, d.papel].filter(Boolean).join(' · ')}
                  </span>
                </div>
                {d.trecho_fonte ? <blockquote className={styles.trecho}>{d.trecho_fonte}</blockquote> : null}
                <Links links={linksDaEvidencia({ documento_id: d.documento_id }, documentosPorId)} />
              </li>
            ))}
          </ol>
        </>
      ) : null}
    </section>
  );
}
