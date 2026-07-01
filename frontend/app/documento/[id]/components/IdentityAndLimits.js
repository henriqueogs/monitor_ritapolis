import KeyValueList from '../../../components/KeyValueList';
import OrigemBadge from '../../../components/OrigemBadge';
import SectionBlock from '../../../components/SectionBlock';
import { formatDate, formatMoney, labelFonte, labelTipo } from '../../../lib/format';
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

export default function IdentityAndLimits({ documento, licitacao }) {
  const modelo = documento.licitacao_modelo || {};
  const isEdital = documento.tipo === 'edital';
  const hasLicitacaoData = isEdital && (licitacao || modelo.processo || modelo.modalidade);

  const vencedorNome = licitacao?.vencedor_nome || null;
  const valorFinal = licitacao?.valor_final ?? null;
  const valorEstimado = modelo.valor_estimado ?? documento.valor_estimado ?? null;
  const origemFinanceira = licitacao?.origem || null;
  const origemUrl = resolveOrigemUrl(origemFinanceira, documento);

  return (
    <div className={styles.contentGrid}>
      <SectionBlock title="Identificação">
        <KeyValueList items={[
          { label: 'Número', value: documento.numero || 'Não identificado' },
          { label: 'Ano', value: documento.ano || 'Não identificado' },
          { label: 'Fonte', value: documento.fonte_nome || labelFonte(documento.fonte) },
          { label: 'Tipo', value: documento.tipo_nome || labelTipo(documento.tipo) },
          { label: 'Arquivo oficial', value: documento.indicadores?.tem_pdf ? 'Disponível' : 'Não vinculado' },
          { label: 'Conteudo legivel', value: documento.indicadores?.tem_texto_extraido ? 'Disponivel' : 'Nao disponivel' },
          { label: 'Data de publicação', value: formatDate(documento.data_publicacao) },
          { label: 'Data de abertura', value: formatDate(documento.data_abertura) }
        ]} />
      </SectionBlock>

      {hasLicitacaoData ? (
        <SectionBlock title="Informações da licitação">
          <KeyValueList items={[
            { label: 'Processo', value: modelo.processo || documento.numero || 'Não identificado' },
            { label: 'Modalidade', value: modelo.modalidade || licitacao?.modalidade || 'Não identificada' },
            { label: 'Objeto', value: modelo.objeto || 'Não identificado' },
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
          ].filter(item => item.value && item.value !== 'null' && item.value !== 'undefined')} />
        </SectionBlock>
      ) : null}
    </div>
  );
}
