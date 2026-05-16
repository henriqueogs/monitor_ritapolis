import KeyValueList from '../../../components/KeyValueList';
import SectionBlock from '../../../components/SectionBlock';
import StatusBadge from '../../../components/StatusBadge';
import { formatDate, formatMoney, labelFonte, labelTipo } from '../../../lib/format';
import styles from '../styles.module.css';

export default function IdentityAndLimits({ documento, licitacao }) {
  return (
    <div className={styles.contentGrid}>
      <SectionBlock title="Identificação">
        <KeyValueList items={[
          { label: 'Número', value: documento.numero || 'Não identificado' },
          { label: 'Ano', value: documento.ano || 'Não identificado' },
          { label: 'Fonte', value: documento.fonte_nome || labelFonte(documento.fonte) },
          { label: 'Tipo', value: documento.tipo_nome || labelTipo(documento.tipo) },
          { label: 'Arquivo oficial', value: documento.indicadores?.tem_pdf ? 'Disponível' : 'Não vinculado' },
          { label: 'Texto extraído', value: documento.indicadores?.tem_texto_extraido ? `${documento.texto_completo_chars?.toLocaleString('pt-BR') || 0} caracteres` : 'Não disponível' },
          { label: 'Data de publicação', value: formatDate(documento.data_publicacao) },
          { label: 'Data de abertura', value: formatDate(documento.data_abertura) },
          { label: 'Valor estimado', value: formatMoney(documento.valor_estimado) }
        ]} />
      </SectionBlock>
      <SectionBlock title="O que ainda não pode ser afirmado">
        <div className={styles.statusList}>
          <div className={styles.statusRow}>
            <div>
              <strong>Fornecedor, vencedor e valor final</strong>
              <p>Dependem de dados estruturados de PNCP ou portal de transparência.</p>
            </div>
            <StatusBadge value={licitacao?.vencedor_nome || licitacao?.valor_final ? 'ok' : 'revisar'} />
          </div>
          <div className={styles.statusRow}>
            <div>
              <strong>Comparações e conclusões amplas</strong>
              <p>Só devem ser feitas quando houver cobertura suficiente.</p>
            </div>
            <StatusBadge value="revisar" />
          </div>
        </div>
      </SectionBlock>
    </div>
  );
}
