import KeyValueList from '../../../components/KeyValueList';
import SectionBlock from '../../../components/SectionBlock';
import { formatMoney } from '../../../lib/format';

export default function LicitationInfo({ documento, licitacao }) {
  if (!licitacao) return null;

  return (
    <SectionBlock title="Informações da licitação">
      <KeyValueList items={[
        { label: 'Modalidade', value: licitacao.modalidade || 'Não identificada' },
        { label: 'Status', value: licitacao.status || documento.status_coleta },
        { label: 'Vencedor', value: licitacao.vencedor_nome || 'Não informado' },
        { label: 'Valor final', value: formatMoney(licitacao.valor_final) }
      ]} />
    </SectionBlock>
  );
}
