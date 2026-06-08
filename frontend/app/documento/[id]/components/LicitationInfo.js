import KeyValueList from '../../../components/KeyValueList';
import SectionBlock from '../../../components/SectionBlock';
import { formatDate, formatMoney } from '../../../lib/format';

export default function LicitationInfo({ documento, licitacao }) {
  const modelo = documento.licitacao_modelo || {};
  const hasModel = Boolean(modelo.processo || modelo.modalidade || modelo.objeto);
  if (!licitacao && !hasModel) return null;

  const anexosLabel = modelo.anexos_total
    ? `${modelo.anexos_total} arquivo${modelo.anexos_total === 1 ? '' : 's'}`
    : 'Nao identificado';

  return (
    <SectionBlock title="Informacoes da licitacao">
      <KeyValueList items={[
        { label: 'Processo', value: modelo.processo || documento.numero || 'Nao identificado' },
        { label: 'Modalidade', value: modelo.modalidade || licitacao?.modalidade || 'Nao identificada' },
        { label: 'Objeto', value: modelo.objeto || 'Nao identificado' },
        { label: 'Sessao ou data', value: formatDate(modelo.data_sessao || documento.data_abertura, 'Nao identificada') },
        { label: 'Valor estimado', value: formatMoney(modelo.valor_estimado ?? documento.valor_estimado) },
        { label: 'Arquivos vinculados', value: anexosLabel },
        { label: 'Status', value: licitacao?.status || documento.status_coleta },
        { label: 'Vencedor', value: licitacao?.vencedor_nome || 'Nao informado' },
        { label: 'Valor final', value: formatMoney(licitacao?.valor_final) },
        { label: 'Origem do resultado', value: licitacao?.origem_detalhe || licitacao?.origem || 'Nao informada' }
      ]} />
    </SectionBlock>
  );
}
