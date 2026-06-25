import SectionBlock from '../../../components/SectionBlock';
import StatusBadge from '../../../components/StatusBadge';
import { formatDate } from '../../../lib/format';
import styles from '../styles.module.css';
import IntegratedReadingAction from './IntegratedReadingAction';

function confidenceLabel(value) {
  if (value == null) return 'Nao informada';
  return `${Math.round(Number(value) * 100)}%`;
}

// Converte nome técnico de campo (valor_global_final) em rótulo legível
// (Valor global final) — nunca expõe nome de variável ao público.
function humanizarCampo(campo) {
  if (!campo) return 'Informação';
  return String(campo).replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

const NIVEL_ALERTA = { alto: 'Requer atenção', medio: 'Moderado', baixo: 'Observação' };
function nivelAlertaLabel(nivel) {
  return NIVEL_ALERTA[String(nivel || '').toLowerCase()] || humanizarCampo(nivel);
}

function sourceLabel(source) {
  const labels = {
    prefeitura: 'Prefeitura',
    pncp: 'PNCP',
    ata: 'Ata',
    contrato: 'Contrato',
    produto: 'Produto',
    grupo: 'Grupo',
    documento: 'Documento',
    outro: 'Outra fonte'
  };

  return labels[source] || source || 'Fonte';
}

function SourceRefs({ fontes }) {
  const items = Array.isArray(fontes) ? fontes : [];
  if (!items.length) return null;

  return (
    <div className={styles.integratedSources}>
      {items.map((fonte, index) => (
        <span key={`${fonte.fonte}-${fonte.campo}-${fonte.identificador || index}`}>
          {sourceLabel(fonte.fonte)}: {humanizarCampo(fonte.campo)}
          {fonte.identificador ? ` (${fonte.identificador})` : ''}
        </span>
      ))}
    </div>
  );
}

export default function IntegratedReadingSection({ leitura, documentoId }) {
  const dados = leitura?.dados;

  if (!dados) {
    return (
      <SectionBlock
        title="Análise do processo"
        description="Esta análise cruza este edital com documentos do mesmo processo (atas, contratos, extratos) para construir uma visão completa do resultado."
      >
        <p className="section-note" style={{ marginBottom: '16px' }}>
          Ainda não há leitura integrada para este documento. A leitura cruza dados do processo, produtos, valores e fontes externas.
        </p>
        <IntegratedReadingAction documentoId={documentoId} />
      </SectionBlock>
    );
  }

  return (
    <SectionBlock
      title="Leitura integrada"
      description="Visão do processo completo: cruza este edital com atas, contratos, produtos e o PNCP para mostrar como o processo terminou — não só o que o edital previa."
      aside={<StatusBadge value={Number(dados.confianca || 0) < 0.6 ? 'revisar' : 'ok'} />}
    >
      <div className={styles.integratedReading}>
        <div className={styles.integratedHeader}>
          <div>
            <h3>{dados.titulo}</h3>
            <p>{dados.leitura_integrada}</p>
          </div>
          <dl>
            <div>
              <dt>Confianca</dt>
              <dd>{confidenceLabel(dados.confianca)}</dd>
            </div>
            <div>
              <dt>Gerado em</dt>
              <dd>{formatDate(leitura.criado_em)}</dd>
            </div>
            <div>
              <dt>Contrato</dt>
              <dd>{leitura.contrato_versao}</dd>
            </div>
          </dl>
        </div>

        {dados.pontos_principais?.length ? (
          <div className={styles.integratedBlock}>
            <h4>Pontos principais</h4>
            <ul className="plain-list">
              {dados.pontos_principais.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        ) : null}

        {dados.consistencia?.length ? (
          <div className={`${styles.integratedBlock} admin-only`}>
            <h4>Consistencia dos dados</h4>
            <div className={styles.integratedList}>
              {dados.consistencia.map((item) => (
                <article key={`${item.campo}-${item.descricao}`}>
                  <strong>{humanizarCampo(item.campo)}</strong>
                  <span>{item.status}</span>
                  <p>{item.descricao}</p>
                  <SourceRefs fontes={item.fontes} />
                </article>
              ))}
            </div>
          </div>
        ) : null}

        {dados.alertas?.length ? (
          <div className={styles.integratedBlock}>
            <h4>Pontos de atenção</h4>
            <div className={styles.integratedList}>
              {dados.alertas.map((item) => (
                <article key={`${item.nivel}-${item.descricao}`}>
                  <strong>{nivelAlertaLabel(item.nivel)}</strong>
                  <p>{item.descricao}</p>
                  <SourceRefs fontes={item.fonte ? [item.fonte] : []} />
                </article>
              ))}
            </div>
          </div>
        ) : null}

        {dados.lacunas?.length ? (
          <div className={styles.integratedBlock}>
            <h4>O que ainda falta na fonte</h4>
            <div className={styles.integratedList}>
              {dados.lacunas.map((item) => (
                <article key={`${item.campo}-${item.descricao}`}>
                  <strong>{humanizarCampo(item.campo)}</strong>
                  <p>{item.descricao}</p>
                </article>
              ))}
            </div>
          </div>
        ) : null}

        <details className={`${styles.integratedDetails} admin-only`}>
          <summary>Fontes usadas pela leitura integrada</summary>
          <SourceRefs fontes={dados.fontes_usadas} />
        </details>

        <div className="admin-only">
          <IntegratedReadingAction documentoId={documentoId} force />
        </div>
      </div>
    </SectionBlock>
  );
}
