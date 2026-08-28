import { Sparkles, Shield } from 'lucide-react';
import AiSummaryAction from '../../../components/AiSummaryAction';
import EvidenceDrawer from '../../../components/EvidenceDrawer';
import KeyValueList from '../../../components/KeyValueList';
import { formatDate, formatMoney } from '../../../lib/format';
import { DISCLAIMER_IA } from '../../../lib/disclaimer';
import styles from '../styles.module.css';

function bestEstimatedValue(item) {
  if (item.valor_total_estimado != null) return item.valor_total_estimado;
  if (item.valor_unitario_estimado != null && item.quantidade != null) {
    return Number(item.valor_unitario_estimado) * Number(item.quantidade);
  }
  return item.valor_unitario_estimado;
}

function bestFinalValue(item) {
  if (item.valor_total_final != null) return item.valor_total_final;
  if (item.valor_lote_final != null) return item.valor_lote_final;
  if (item.valor_global_final != null) return item.valor_global_final;
  if (item.valor_unitario_final != null && item.quantidade != null) {
    return Number(item.valor_unitario_final) * Number(item.quantidade);
  }
  return item.valor_unitario_final;
}

function formatConfidence(value) {
  if (value == null) return 'Não informada';
  return `${Math.round(Number(value) * 100)}%`;
}

// Nome técnico (valor_estimado) → rótulo legível (Valor estimado).
function humanizarCampo(campo) {
  if (!campo) return '';
  return String(campo).replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

// Complemento técnico da leitura por IA — o resumo em si (texto cidadão,
// pontos principais, objeto, datas relevantes) já aparece no topo da página
// em "Resumo do documento" (SummaryAndSource). Aqui fica só o que é
// detalhe/administração: confiança, modelo, leitura técnica, evidências,
// valores e partes envolvidas, e o controle de gerar/regerar.
export default function AiSummarySection({ resumoAi, operacao }) {
  const dados = resumoAi?.dados;
  const job = resumoAi?.job;
  const jobAtivo = job && ['pendente', 'processando'].includes(job.status);
  const jobErro = job?.status === 'erro';

  if (!dados) {
    return (
      <div className={`${styles.aiCard} admin-only`}>
        <div className={styles.aiHeader}>
          <Sparkles size={20} style={{ color: 'var(--ai-accent)' }} />
          <h3 className={styles.aiTitle}>Leitura por IA</h3>
        </div>
        {jobAtivo ? (
          <div className={styles.aiNotice}>
            Leitura {job.status === 'processando' ? 'em processamento' : 'na fila'}. Recarregue a pagina em alguns instantes para ver o resultado.
          </div>
        ) : null}
        {jobErro ? (
          <div className={styles.aiNoticeError}>
            A última tentativa de resumo falhou: {job.erro || 'erro não informado'}. Você pode tentar novamente.
          </div>
        ) : null}
        <AiSummaryAction documentoId={resumoAi?.documento_id} disabled={jobAtivo} />
        {operacao && !operacao.recomendado_frontend ? (
          <div className={styles.aiLargeDoc}>
            <p>Este documento tem {operacao?.caracteres?.toLocaleString('pt-BR') || 'muitos'} caracteres e será processado em background.</p>
          </div>
        ) : null}
      </div>
    );
  }

  const staleSummary = resumoAi.corresponde_ao_texto_atual === false;

  return (
    <div className={`${styles.aiCard} admin-only`}>
      <div className={styles.aiHeaderSpread}>
        <div className={styles.aiHeaderMain}>
          <Sparkles size={22} style={{ color: 'var(--ai-accent)' }} />
          <div>
            <h3 className={styles.aiTitleLarge}>Detalhes da leitura por IA</h3>
            <span className={styles.aiMeta}>
              Gerado por {resumoAi.modelo || 'IA'} • {resumoAi.criado_em ? formatDate(resumoAi.criado_em) : ''}
            </span>
          </div>
        </div>
      </div>

      <div className={`${styles.aiNotice} ${styles.aiNoticeCompact}`}>
        <Shield size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
        {DISCLAIMER_IA}
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

      <KeyValueList items={[
        { label: 'Confianca', value: formatConfidence(dados.confianca) },
        { label: 'Compatibilidade', value: resumoAi.corresponde_ao_texto_atual ? 'Compatível' : 'Revisar' },
        { label: 'Modelo', value: resumoAi.modelo }
      ]} />

      {dados.resumo_tecnico ? (
        <div className={styles.aiSummaryGroup}>
          <h4>Leitura técnica</h4>
          <p className="lead-text">{dados.resumo_tecnico}</p>
        </div>
      ) : null}

      <EvidenceDrawer dados={dados} />

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
          <h4>O que não constava no documento</h4>
          <p className="lead-text">{dados.campos_nao_encontrados.map(humanizarCampo).join(', ')}</p>
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
