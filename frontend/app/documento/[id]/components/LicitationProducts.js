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

// Item "útil" tem ao menos um dado concreto além da descrição: quantidade,
// fornecedor ou algum valor. Os demais (só descrição) colapsam — não enchem a
// tela de "Não informado".
function temDadoUtil(item) {
  return (
    item.quantidade != null ||
    Boolean(item.fornecedor_nome) ||
    bestEstimatedValue(item) != null ||
    bestFinalValue(item) != null
  );
}

function ProductRow({ item }) {
  const estimado = bestEstimatedValue(item);
  const final = bestFinalValue(item);
  const lote = item.lote_numero ? `Lote ${item.lote_numero}` : null;
  const itemNum = item.item_numero ? `Item ${item.item_numero}` : null;

  return (
    <article className="product-row">
      <div className="product-row-main">
        {lote || itemNum ? (
          <div className="document-row-meta">
            {lote ? <span>{lote}</span> : null}
            {itemNum ? <span>{itemNum}</span> : null}
          </div>
        ) : null}
        <h3>{item.descricao}</h3>
        {item.quantidade != null ? (
          <p>
            Quantidade {item.quantidade}
            {item.unidade ? ` ${item.unidade}` : ''}
          </p>
        ) : null}
        {item.trecho_fonte ? <span className="product-source-line">{item.trecho_fonte}</span> : null}
      </div>
      <div className="product-row-side">
        {estimado != null ? (
          <div className="document-row-field">
            <span>Estimado</span>
            <strong>{formatMoney(estimado)}</strong>
          </div>
        ) : null}
        {final != null ? (
          <div className="document-row-field">
            <span>{finalValueLabel(item)}</span>
            <strong>{formatMoney(final)}</strong>
          </div>
        ) : null}
        {item.fornecedor_nome ? (
          <div className="document-row-field">
            <span>Fornecedor</span>
            <strong>{item.fornecedor_nome}</strong>
          </div>
        ) : null}
      </div>
    </article>
  );
}

export default function LicitationProducts({ produtos }) {
  const itens = produtos?.dados || [];

  if (!itens.length) {
    return (
      <SectionBlock
        title="Itens deste processo"
        description="Produtos, preços e fornecedores citados nos documentos — quando a fonte oficial informa."
      >
        <p className="empty-state">Nenhum item estruturado para este documento.</p>
      </SectionBlock>
    );
  }

  const comDados = itens.filter(temDadoUtil);
  const semDados = itens.filter((item) => !temDadoUtil(item));

  return (
    <SectionBlock
      title="Itens deste processo"
      description="Produtos, preços e fornecedores citados nos documentos — quando a fonte oficial informa."
    >
      {comDados.length ? (
        <div className="products-table">
          {comDados.map((item) => (
            <ProductRow key={item.id} item={item} />
          ))}
        </div>
      ) : (
        <p className="empty-state">Os itens deste processo ainda não têm preço ou fornecedor na fonte.</p>
      )}

      {semDados.length ? (
        <details className="details-block" style={{ marginTop: comDados.length ? '16px' : '0' }}>
          <summary>
            {semDados.length} {semDados.length === 1 ? 'item citado sem preço/fornecedor' : 'itens citados sem preço/fornecedor'}
          </summary>
          <ul className="plain-list" style={{ marginTop: '12px' }}>
            {semDados.map((item) => (
              <li key={item.id}>{item.descricao}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </SectionBlock>
  );
}
