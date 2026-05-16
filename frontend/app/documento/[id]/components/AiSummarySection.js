import { Sparkles, Shield } from 'lucide-react';
import AiSummaryAction from '../../../components/AiSummaryAction';
import EvidenceDrawer from '../../../components/EvidenceDrawer';
import KeyValueList from '../../../components/KeyValueList';
import StatusBadge from '../../../components/StatusBadge';
import { formatDate, formatMoney } from '../../../lib/format';
import styles from '../styles.module.css';

function formatConfidence(value) {
  if (value == null) return 'Não informada';
  return `${Math.round(Number(value) * 100)}%`;
}

export default function AiSummarySection({ resumoAi, operacao }) {
  const dados = resumoAi?.dados;
  const job = resumoAi?.job;
  const jobAtivo = job && ['pendente', 'processando'].includes(job.status);
  const jobErro = job?.status === 'erro';

  if (!dados) {
    return (
      <div className={styles.aiCard}>
        <div className={styles.aiHeader}>
          <Sparkles size={20} style={{ color: 'var(--ai-accent)' }} />
          <h3 className={styles.aiTitle}>
            Análise da IA
          </h3>
        </div>
        <p className="lead-text" style={{ marginBottom: '16px' }}>
          Ainda não há resumo de IA para este documento. O arquivo oficial e o texto extraído seguem disponíveis abaixo.
        </p>
        {jobAtivo ? (
          <div className={styles.aiNotice}>
            Resumo {job.status === 'processando' ? 'em processamento' : 'na fila'}. Recarregue a página em alguns instantes para ver o resultado.
          </div>
        ) : null}
        {jobErro ? (
          <div className={styles.aiNoticeError}>
            A última tentativa de resumo falhou: {job.erro || 'erro não informado'}. Você pode tentar novamente.
          </div>
        ) : null}
        <AiSummaryAction documentoId={resumoAi?.documento_id} disabled={jobAtivo} />
        {!operacao?.recomendado_frontend ? (
          <div className={styles.aiLargeDoc}>
            <p>Este documento tem {operacao?.caracteres?.toLocaleString('pt-BR') || 'muitos'} caracteres e será processado em background.</p>
          </div>
        ) : null}
      </div>
    );
  }

  const lowConfidence = Number(dados.confianca || 0) < 0.6;
  const staleSummary = resumoAi.corresponde_ao_texto_atual === false;

  return (
    <div className={styles.aiCard}>
      <div className={styles.aiHeaderSpread}>
        <div className={styles.aiHeaderMain}>
          <Sparkles size={22} style={{ color: 'var(--ai-accent)' }} />
          <div>
            <h3 className={styles.aiTitleLarge}>Análise da IA</h3>
            <span className={styles.aiMeta}>
              Gerado por {resumoAi.modelo || 'IA'} • {resumoAi.criado_em ? formatDate(resumoAi.criado_em) : ''}
            </span>
          </div>
        </div>
        <StatusBadge value={lowConfidence || staleSummary ? 'revisar' : 'ok'} />
      </div>

      <div className={`${styles.aiNotice} ${styles.aiNoticeCompact}`}>
        <Shield size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
        Este resumo foi gerado por IA a partir do texto extraído do arquivo oficial. Confira a fonte antes de tomar decisão.
        {resumoAi.provider ? <span style={{ marginLeft: '8px', opacity: 0.7 }}>• Provider: {resumoAi.provider}</span> : null}
      </div>

      {staleSummary ? (
        <div className={styles.aiNoticeWarn}>
          O texto atual do documento não corresponde ao hash salvo neste resumo. Gere novamente antes de usar.
        </div>
      ) : null}

      <div style={{ marginBottom: '16px' }}>
        <AiSummaryAction
          documentoId={resumoAi.documento_id}
          label={staleSummary ? 'Gerar resumo atualizado' : 'Gerar novamente'}
          force
          variant="secondary"
          confirmMessage="Isso fará uma nova chamada à IA e pode consumir créditos da NVIDIA. Deseja continuar?"
          disabled={jobAtivo}
        />
      </div>

      <div className={styles.aiSummaryLayout}>
        <div className={styles.aiSummaryMain}>
          <h3>{dados.titulo_curto || 'Resumo do documento'}</h3>
          <p>{dados.resumo_cidadao}</p>
          {dados.pontos_principais?.length ? (
            <div className={styles.aiSummaryGroup}>
              <h4>Pontos principais</h4>
              <ul className="plain-list">
                {dados.pontos_principais.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          ) : null}
        </div>
        <div className={styles.aiSummarySide}>
          <KeyValueList items={[
            { label: 'Confiança', value: formatConfidence(dados.confianca) },
            { label: 'Gerado em', value: formatDate(resumoAi.criado_em) },
            { label: 'Compatibilidade', value: resumoAi.corresponde_ao_texto_atual ? 'Compatível' : 'Revisar' },
            { label: 'Modelo', value: resumoAi.modelo }
          ]} />
        </div>
      </div>

      {dados.resumo_tecnico ? (
        <div className={styles.aiSummaryGroup}>
          <h4>Leitura técnica</h4>
          <p className="lead-text">{dados.resumo_tecnico}</p>
        </div>
      ) : null}

      <EvidenceDrawer dados={dados} />

      {dados.objeto?.descricao ? (
        <div className={styles.aiEvidenceRow}>
          <strong>Objeto</strong>
          <p>{dados.objeto.descricao}</p>
          {dados.objeto.trecho_fonte ? <span>{dados.objeto.trecho_fonte}</span> : null}
        </div>
      ) : null}

      {dados.datas_relevantes?.length ? (
        <div className={styles.aiSummaryGroup}>
          <h4>Datas relevantes</h4>
          <div className="simple-table">
            {dados.datas_relevantes.map((item) => (
              <div key={`${item.tipo}-${item.data}-${item.descricao}`} className="table-row table-row-stacked">
                <div>
                  <strong>{item.data ? formatDate(item.data) : 'Data não identificada'}</strong>
                  <p>{item.descricao}</p>
                  <span>{item.trecho_fonte}</span>
                </div>
                <span>{item.tipo}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {dados.valores?.length ? (
        <div className={styles.aiSummaryGroup}>
          <h4>Valores encontrados</h4>
          <div className="simple-table">
            {dados.valores.map((item) => (
              <div key={`${item.tipo}-${item.valor}-${item.descricao}`} className="table-row table-row-stacked">
                <div>
                  <strong>{formatMoney(item.valor)}</strong>
                  <p>{item.descricao}</p>
                  <span>{item.trecho_fonte}</span>
                </div>
                <span>{item.tipo}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {dados.partes_envolvidas?.length ? (
        <div className={styles.aiSummaryGroup}>
          <h4>Partes envolvidas</h4>
          <div className="simple-table">
            {dados.partes_envolvidas.map((item) => (
              <div key={`${item.nome}-${item.papel}`} className="table-row table-row-stacked">
                <div>
                  <strong>{item.nome}</strong>
                  <p>{item.documento || 'Documento não informado'}</p>
                  <span>{item.trecho_fonte}</span>
                </div>
                <span>{item.papel}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {dados.campos_nao_encontrados?.length ? (
        <div className={styles.aiSummaryGroup}>
          <h4>Campos não encontrados</h4>
          <p className="lead-text">{dados.campos_nao_encontrados.join(', ')}</p>
        </div>
      ) : null}

      <details className={`details-block ${styles.aiSummaryGroup}`}>
        <summary>Ver dados técnicos do resumo</summary>
        <KeyValueList items={[
          { label: 'Provider', value: resumoAi.provider },
          { label: 'Modelo', value: resumoAi.modelo },
          { label: 'Contrato', value: resumoAi.contrato_versao },
          { label: 'Status', value: resumoAi.status },
          { label: 'Hash salvo', value: resumoAi.texto_hash || 'Não informado' },
          { label: 'Hash atual', value: resumoAi.texto_hash_atual || 'Não informado' }
        ]} />
      </details>
    </div>
  );
}
