import SectionBlock from '../../../components/SectionBlock';
import { getFallbackSourceUrl, getOfficialFileUrl, getSpecificSourcePageUrl } from '../../../lib/source-links';
import styles from '../styles.module.css';

export default function RelatedSources({ documento }) {
  return (
    <SectionBlock title="Fontes relacionadas">
      {documento.fontes_relacionadas?.length ? (
        <div className={styles.sourceList}>
          {documento.fontes_relacionadas.map((fonte) => {
            const fd = { ...documento, url_origem: fonte.url_origem, url_pdf: fonte.url_pdf };
            const url = getOfficialFileUrl(fd) || getSpecificSourcePageUrl(fd) || getFallbackSourceUrl(fd);

            return (
              <div key={`${fonte.fonte}-${fonte.url_origem}`} className={styles.sourceRow}>
                <div>
                  <strong>{fonte.fonte}</strong>
                  <p>{url || 'Referência indisponível'}</p>
                </div>
                {url ? <a href={url} target="_blank" rel="noopener noreferrer">{getOfficialFileUrl(fd) ? 'Abrir arquivo' : 'Abrir consulta'}</a> : <span>Indisponível</span>}
              </div>
            );
          })}
        </div>
      ) : <p className="empty-state">Nenhuma fonte relacionada.</p>}
    </SectionBlock>
  );
}
