import SectionBlock from '../../../components/SectionBlock';
import { formatMoney } from '../../../lib/format';

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

function finalValueLabel(item) {
  if (item.valor_total_final != null) return 'Final total';
  if (item.valor_lote_final != null) return 'Final lote';
  if (item.valor_global_final != null) return 'Final global';
  if (item.valor_unitario_final != null && item.quantidade != null) return 'Final calculado';
  if (item.valor_unitario_final != null) return 'Final unitario';
  return 'Final';
}

function originLabel(value) {
  const labels = {
    ia_resumo: 'Extraido por IA',
    texto_tabela: 'Tabela oficial',
    ata_resultado: 'Ata de resultado',
    'texto_tabela+ata_resultado': 'Tabela oficial + ata',
    'ia_resumo+ata_resultado': 'IA + ata'
  };

  return labels[value] || value || 'Origem nao informada';
}

function validationLabel(item) {
  if (!item.validacoes_total) return 'Sem validacao';

  const labels = {
    pendente: 'Pendente',
    validado: 'Validado',
    divergente: 'Divergente',
    sem_correspondencia: 'Sem correspondencia',
    revisar: 'Revisar'
  };

  return labels[item.validacao_status] || item.validacao_status || 'Revisar';
}

export default function LicitationProducts({ produtos }) {
  const itens = produtos?.dados || [];

  if (!itens.length) {
    return (
      <SectionBlock
        title="Produtos licitados"
        description="Produtos aparecem aqui quando o documento ou o resumo IA trazem itens com evidencia textual."
      >
        <p className="empty-state">Nenhum produto estruturado para este documento.</p>
      </SectionBlock>
    );
  }

  return (
    <SectionBlock
      title="Itens deste processo"
      description="Produtos, preços e fornecedores citados nos documentos — quando a fonte oficial informa."
    >
      <div className="products-table">
        {itens.map((item) => (
          <article key={item.id} className="product-row">
            <div className="product-row-main">
              <div className="document-row-meta">
                <span>{item.lote_numero ? `Lote ${item.lote_numero}` : 'Sem lote'}</span>
                <span>{item.item_numero ? `Item ${item.item_numero}` : 'Sem item'}</span>
                <span>{originLabel(item.origem)}</span>
              </div>
              <h3>{item.descricao}</h3>
              <p>
                {item.quantidade ? `Quantidade ${item.quantidade}` : 'Quantidade nao informada'}
                {item.unidade ? ` ${item.unidade}` : ''}
              </p>
              {item.trecho_fonte ? <span className="product-source-line">{item.trecho_fonte}</span> : null}
            </div>
            <div className="product-row-side">
              <div className="document-row-field">
                <span>Estimado</span>
                <strong>{formatMoney(bestEstimatedValue(item))}</strong>
              </div>
              <div className="document-row-field">
                <span>{finalValueLabel(item)}</span>
                <strong>{formatMoney(bestFinalValue(item))}</strong>
              </div>
              <div className="document-row-field">
                <span>Fornecedor</span>
                <strong>{item.fornecedor_nome || 'Nao informado'}</strong>
              </div>
              <div className="product-origin-status">
                <span>{validationLabel(item)}</span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </SectionBlock>
  );
}
