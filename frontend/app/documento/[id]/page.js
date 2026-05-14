import AiSummaryAction from '../../components/AiSummaryAction';
import DocumentPreviewPane from '../../components/DocumentPreviewPane';
import EvidenceDrawer from '../../components/EvidenceDrawer';
import KeyValueList from '../../components/KeyValueList';
import QualitySignals from '../../components/QualitySignals';
import SectionBlock from '../../components/SectionBlock';
import SourceTrace from '../../components/SourceTrace';
import SourceLinks from '../../components/SourceLinks';
import StatusBadge from '../../components/StatusBadge';
import ValidationStatus from '../../components/ValidationStatus';
import { fetchDocumento } from '../../lib/api';
import { bestResumo, formatDate, formatMoney, labelFonte, labelTipo } from '../../lib/format';
import { getFallbackSourceUrl, getOfficialFileUrl, getSpecificSourcePageUrl } from '../../lib/source-links';

function formatConfidence(value) {
  if (value == null) return 'Nao informada';
  return `${Math.round(Number(value) * 100)}%`;
}

function AiSummarySection({ resumoAi, operacao }) {
  const dados = resumoAi?.dados;
  const job = resumoAi?.job;
  const jobAtivo = job && ['pendente', 'processando'].includes(job.status);
  const jobErro = job?.status === 'erro';

  if (!dados) {
    return (
      <SectionBlock title="Resumo gerado por IA">
        <p className="empty-state">
          Ainda nao ha resumo de IA para este documento. O arquivo oficial e o texto extraido seguem disponiveis abaixo.
        </p>
        {jobAtivo ? (
          <div className="ai-notice ai-notice-warn">
            Resumo {job.status === 'processando' ? 'em processamento' : 'na fila'}. Recarregue a pagina em alguns
            instantes para ver o resultado.
          </div>
        ) : null}
        {jobErro ? (
          <div className="ai-notice ai-notice-warn">
            A ultima tentativa de resumo falhou: {job.erro || 'erro nao informado'}. Voce pode tentar novamente.
          </div>
        ) : null}
        <AiSummaryAction documentoId={resumoAi?.documento_id} disabled={jobAtivo} />
        {!operacao?.recomendado_frontend ? (
          <div className="ai-large-doc">
            <p>
              Este documento tem {operacao?.caracteres?.toLocaleString('pt-BR') || 'muitos'} caracteres e sera
              processado em background com {operacao?.chunks_previstos || 'multiplos'} chunks.
            </p>
          </div>
        ) : null}
      </SectionBlock>
    );
  }

  const lowConfidence = Number(dados.confianca || 0) < 0.6;
  const staleSummary = resumoAi.corresponde_ao_texto_atual === false;

  return (
    <SectionBlock
      title="Resumo gerado por IA"
      aside={<StatusBadge value={lowConfidence || staleSummary ? 'revisar' : 'ok'} />}
    >
      <div className={lowConfidence ? 'ai-notice ai-notice-warn' : 'ai-notice'}>
        Este resumo foi gerado por IA a partir do texto extraido do arquivo oficial. Ele e uma leitura de apoio:
        confira a fonte e os trechos antes de tomar decisao.
      </div>
      {staleSummary ? (
        <div className="ai-notice ai-notice-warn">
          O texto atual do documento nao corresponde ao hash salvo neste resumo. Gere novamente antes de usar este
          resumo como apoio.
        </div>
      ) : null}
      <AiSummaryAction
        documentoId={resumoAi.documento_id}
        label={staleSummary ? 'Gerar resumo atualizado' : 'Gerar novamente'}
        force
        variant="secondary"
        confirmMessage="Isso fara uma nova chamada a IA e pode consumir creditos da NVIDIA. Deseja continuar?"
        disabled={jobAtivo}
      />
      {!operacao?.recomendado_frontend ? (
        <div className="ai-large-doc">
          <p>
            Documento grande: a regeneracao pela tela sera enviada para processamento em background.
          </p>
        </div>
      ) : null}

      <div className="ai-summary-layout">
        <div className="ai-summary-main">
          <h3>{dados.titulo_curto || 'Resumo do documento'}</h3>
          <p>{dados.resumo_cidadao}</p>

          {dados.pontos_principais?.length ? (
            <div className="ai-summary-group">
              <h4>Pontos principais</h4>
              <ul className="plain-list">
                {dados.pontos_principais.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="ai-summary-side">
          <KeyValueList
            items={[
              { label: 'Confianca', value: formatConfidence(dados.confianca) },
              { label: 'Gerado em', value: formatDate(resumoAi.criado_em) },
              { label: 'Texto atual', value: resumoAi.corresponde_ao_texto_atual ? 'Compativel' : 'Revisar' },
              { label: 'Modelo', value: resumoAi.modelo }
            ]}
          />
        </div>
      </div>

      {dados.resumo_tecnico ? (
        <div className="ai-summary-group">
          <h4>Leitura tecnica</h4>
          <p className="lead-text">{dados.resumo_tecnico}</p>
        </div>
      ) : null}

      <EvidenceDrawer dados={dados} />

      {dados.objeto?.descricao ? (
        <div className="ai-evidence-row">
          <strong>Objeto</strong>
          <p>{dados.objeto.descricao}</p>
          {dados.objeto.trecho_fonte ? <span>{dados.objeto.trecho_fonte}</span> : null}
        </div>
      ) : null}

      {dados.datas_relevantes?.length ? (
        <div className="ai-summary-group">
          <h4>Datas relevantes</h4>
          <div className="simple-table">
            {dados.datas_relevantes.map((item) => (
              <div key={`${item.tipo}-${item.data}-${item.descricao}`} className="table-row table-row-stacked">
                <div>
                  <strong>{item.data ? formatDate(item.data) : 'Data nao identificada'}</strong>
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
        <div className="ai-summary-group">
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
        <div className="ai-summary-group">
          <h4>Partes envolvidas</h4>
          <div className="simple-table">
            {dados.partes_envolvidas.map((item) => (
              <div key={`${item.nome}-${item.papel}`} className="table-row table-row-stacked">
                <div>
                  <strong>{item.nome}</strong>
                  <p>{item.documento || 'Documento nao informado'}</p>
                  <span>{item.trecho_fonte}</span>
                </div>
                <span>{item.papel}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {dados.campos_nao_encontrados?.length ? (
        <div className="ai-summary-group">
          <h4>Campos nao encontrados</h4>
          <p className="lead-text">{dados.campos_nao_encontrados.join(', ')}</p>
        </div>
      ) : null}

      <details className="details-block ai-summary-group">
        <summary>Ver dados tecnicos do resumo</summary>
        <KeyValueList
          items={[
            { label: 'Provider', value: resumoAi.provider },
            { label: 'Modelo', value: resumoAi.modelo },
            { label: 'Contrato', value: resumoAi.contrato_versao },
            { label: 'Status', value: resumoAi.status },
            { label: 'Hash salvo', value: resumoAi.texto_hash || 'Nao informado' },
            { label: 'Hash atual', value: resumoAi.texto_hash_atual || 'Nao informado' }
          ]}
        />
      </details>
    </SectionBlock>
  );
}

export default async function DocumentoPage({ params }) {
  const documento = await fetchDocumento(params.id);
  const licitacao = documento.licitacao_detalhes || documento.dados_extras?.licitacao || null;

  return (
    <main className="page-container">
      <div className="page-title page-title-detail">
        <div>
          <div className="document-row-meta">
            <span>{documento.fonte_nome || labelFonte(documento.fonte)}</span>
            <span>{documento.tipo_nome || labelTipo(documento.tipo)}</span>
            <span>{formatDate(documento.data_publicacao || documento.atualizado_em)}</span>
          </div>
          <h1>{documento.titulo}</h1>
          <QualitySignals documento={documento} />
        </div>
        <StatusBadge value={licitacao?.status || documento.status_coleta} />
      </div>

      <div className="proof-grid">
        <SectionBlock title="Resumo do documento">
          <p className="lead-text">
            {bestResumo(documento)}
          </p>
          {documento.qualidade_alertas?.length ? (
            <div className="quality-alert-stack">
              {documento.qualidade_alertas.map((alerta) => (
                <div key={alerta.tipo} className="quality-alert">
                  <strong>{alerta.label}</strong>
                  <p>{alerta.descricao}</p>
                </div>
              ))}
            </div>
          ) : null}
          <SourceLinks documento={documento} />
        </SectionBlock>

        <SectionBlock title="Validacao e fonte">
          <ValidationStatus resumoAi={documento.resumo_ai} documento={documento} />
          <SourceTrace documento={documento} />
        </SectionBlock>
      </div>

      <DocumentPreviewPane documento={documento} />

      <div className="content-grid">
        <SectionBlock title="Identificacao">
          <KeyValueList
            items={[
              { label: 'Numero', value: documento.numero || 'Nao identificado' },
              { label: 'Ano', value: documento.ano || 'Nao identificado' },
              { label: 'Fonte', value: documento.fonte_nome || labelFonte(documento.fonte) },
              { label: 'Tipo', value: documento.tipo_nome || labelTipo(documento.tipo) },
              { label: 'Arquivo oficial', value: documento.indicadores?.tem_pdf ? 'Disponivel' : 'Nao vinculado' },
              {
                label: 'Texto extraido',
                value: documento.indicadores?.tem_texto_extraido
                  ? `${documento.texto_completo_chars?.toLocaleString('pt-BR') || 0} caracteres`
                  : 'Nao disponivel'
              },
              { label: 'Data de publicacao', value: formatDate(documento.data_publicacao) },
              { label: 'Data de abertura', value: formatDate(documento.data_abertura) },
              { label: 'Valor estimado', value: formatMoney(documento.valor_estimado) }
            ]}
          />
        </SectionBlock>

        <SectionBlock title="O que ainda nao pode ser afirmado">
          <div className="status-list">
            <div className="status-row">
              <div>
                <strong>Fornecedor, vencedor e valor final</strong>
                <p>Dependem de dados estruturados de PNCP ou portal de transparencia quando nao aparecem na fonte atual.</p>
              </div>
              <StatusBadge value={licitacao?.vencedor_nome || licitacao?.valor_final ? 'ok' : 'revisar'} />
            </div>
            <div className="status-row">
              <div>
                <strong>Comparacoes e conclusoes amplas</strong>
                <p>So devem ser feitas quando houver cobertura suficiente e relacao real entre fontes.</p>
              </div>
              <StatusBadge value="revisar" />
            </div>
          </div>
        </SectionBlock>
      </div>

      <AiSummarySection
        resumoAi={{
          ...documento.resumo_ai,
          documento_id: documento.id,
          texto_hash_atual: documento.texto_hash_atual,
          job: documento.resumo_ai_job
        }}
        operacao={documento.resumo_ai_operacao}
      />

      {licitacao ? (
        <SectionBlock title="Informacoes da licitacao">
          <KeyValueList
            items={[
              { label: 'Modalidade', value: licitacao.modalidade || 'Nao identificada' },
              { label: 'Status', value: licitacao.status || documento.status_coleta },
              { label: 'Vencedor', value: licitacao.vencedor_nome || 'Nao informado' },
              { label: 'Valor final', value: formatMoney(licitacao.valor_final) }
            ]}
          />
        </SectionBlock>
      ) : null}

      <SectionBlock title="Fontes relacionadas">
        {documento.fontes_relacionadas?.length ? (
          <div className="source-list">
            {documento.fontes_relacionadas.map((fonte) => {
              const fonteDocumento = {
                ...documento,
                url_origem: fonte.url_origem,
                url_pdf: fonte.url_pdf
              };
              const officialFileUrl = getOfficialFileUrl(fonteDocumento);
              const sourcePageUrl = getSpecificSourcePageUrl(fonteDocumento);
              const fallbackSourceUrl = getFallbackSourceUrl(fonteDocumento);
              const linkUrl = officialFileUrl || sourcePageUrl || fallbackSourceUrl;

              return (
                <div key={`${fonte.fonte}-${fonte.url_origem}-${fonte.url_pdf}`} className="source-row">
                  <div>
                    <strong>{fonte.fonte}</strong>
                    <p>{officialFileUrl || sourcePageUrl || fallbackSourceUrl || 'Referencia indisponivel'}</p>
                  </div>
                  {linkUrl ? (
                    <a href={linkUrl} target="_blank" rel="noopener noreferrer">
                      {officialFileUrl ? 'Abrir arquivo' : 'Abrir consulta'}
                    </a>
                  ) : (
                    <span>Indisponivel</span>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="empty-state">Nenhuma fonte relacionada cadastrada.</p>
        )}
      </SectionBlock>

      <SectionBlock title="Texto completo">
        <details className="details-block">
          <summary>Ler conteudo extraido</summary>
          <pre className="document-text">{documento.texto_completo || 'Sem texto extraido.'}</pre>
        </details>
      </SectionBlock>

      <SectionBlock title="Dados tecnicos">
        <details className="details-block">
          <summary>Ver dados extras e estrutura bruta</summary>
          <pre className="document-text">{JSON.stringify(documento.dados_extras, null, 2)}</pre>
        </details>
      </SectionBlock>
    </main>
  );
}
