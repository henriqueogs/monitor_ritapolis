import KeyValueList from '../../../components/KeyValueList';
import OrigemBadge from '../../../components/OrigemBadge';
import SectionBlock from '../../../components/SectionBlock';
import SourceLinks from '../../../components/SourceLinks';
import { bestResumo, formatDate, formatMoney, labelFonte, labelTipo } from '../../../lib/format';
import styles from '../styles.module.css';

/**
 * Resolve a URL de verificação para a origem de um dado financeiro.
 * PNCP: usa url_origem do documento. Portal Transparência: URL padrão.
 */
function resolveOrigemUrl(origem, documento) {
  if (!origem) return undefined;
  if (origem === 'pncp') return documento?.url_origem || undefined;
  return undefined; // deixar o OrigemBadge usar a URL padrão da origem
}

// Bloco de abertura da página: o que o cidadão precisa saber primeiro —
// leitura simples da IA (quando existe) e os fatos essenciais do documento,
// sintetizados num só lugar. Identificação, Informações da licitação e
// Origem/limites (que só repetia o que a leitura da IA já diz) viviam em
// cards separados; juntar tudo aqui evita que o card principal fique vazio
// quando só existe o botão de "abrir documento oficial".
export default function SummaryAndSource({ documento, licitacao }) {
  const dados = documento.resumo_ai?.dados;
  const modelo = documento.licitacao_modelo || {};
  const isEdital = documento.tipo === 'edital';
  const hasLicitacaoData = isEdital && (licitacao || modelo.processo || modelo.modalidade);

  const vencedorNome = licitacao?.vencedor_nome || null;
  const valorFinal = licitacao?.valor_final ?? null;
  const valorEstimado = modelo.valor_estimado ?? documento.valor_estimado ?? null;
  const origemFinanceira = licitacao?.origem || null;
  const origemUrl = resolveOrigemUrl(origemFinanceira, documento);

  const identificacaoItems = [
    { label: 'Data de publicação', value: formatDate(documento.data_publicacao) },
    { label: 'Número', value: documento.numero || 'Não identificado' },
    { label: 'Ano', value: documento.ano || 'Não identificado' },
    { label: 'Fonte', value: documento.fonte_nome || labelFonte(documento.fonte) },
    { label: 'Tipo', value: documento.tipo_nome || labelTipo(documento.tipo) },
    { label: 'Data de abertura', value: formatDate(documento.data_abertura) },
  ];

  const licitacaoItems = [
    { label: 'Processo', value: modelo.processo || documento.numero || 'Não identificado' },
    { label: 'Modalidade', value: modelo.modalidade || licitacao?.modalidade || 'Não identificada' },
    { label: 'Sessão', value: formatDate(modelo.data_sessao || documento.data_abertura) },
    { label: 'Valor estimado', value: formatMoney(valorEstimado) },
    { label: 'Status', value: licitacao?.status || null },
    {
      label: 'Vencedor',
      value: vencedorNome
        ? <>{vencedorNome}<OrigemBadge origem={origemFinanceira} url={origemUrl} /></>
        : null
    },
    {
      label: 'Valor final',
      value: valorFinal != null
        ? <>{formatMoney(valorFinal)}<OrigemBadge origem={origemFinanceira} url={origemUrl} /></>
        : null
    }
  ].filter((item) => item.value && item.value !== 'null' && item.value !== 'undefined');

  return (
    <SectionBlock title="Resumo do documento">
      <p className="lead-text">{bestResumo(documento)}</p>
      {dados?.pontos_principais?.length ? (
        <div className={styles.aiSummaryGroup}>
          <h4>Pontos principais</h4>
          <ul className="plain-list">
            {dados.pontos_principais.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      ) : null}
      {documento.qualidade_alertas?.length ? (
        <div className={styles.qualityAlertStack}>
          {documento.qualidade_alertas.map((alerta) => (
            <div key={alerta.tipo} className={styles.qualityAlert}>
              <strong>{alerta.label}</strong>
              <p>{alerta.descricao}</p>
            </div>
          ))}
        </div>
      ) : null}
      <SourceLinks documento={documento} />

      <div className={styles.contentGrid} style={{ marginTop: '24px' }}>
        <KeyValueList items={identificacaoItems} />
        {hasLicitacaoData && licitacaoItems.length ? <KeyValueList items={licitacaoItems} /> : null}
      </div>

      {dados?.objeto?.descricao ? (
        <div className={styles.aiEvidenceRow}>
          <strong>Objeto</strong>
          <p>{dados.objeto.descricao}</p>
        </div>
      ) : null}

      {dados?.datas_relevantes?.length ? (
        <div className={styles.aiSummaryGroup}>
          <h4>Datas relevantes</h4>
          <div className="simple-table">
            {dados.datas_relevantes.map((item) => (
              <div key={`${item.tipo}-${item.data}-${item.descricao}`} className="table-row table-row-stacked">
                <div>
                  <strong>{item.data ? formatDate(item.data) : 'Data não identificada'}</strong>
                  <p>{item.descricao}</p>
                </div>
                <span>{item.tipo}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </SectionBlock>
  );
}
