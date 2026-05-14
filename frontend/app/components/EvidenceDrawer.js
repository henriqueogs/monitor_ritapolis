import { formatDate, formatMoney } from '../lib/format';

function EvidenceRow({ title, children, note }) {
  return (
    <div className="evidence-row">
      <strong>{title}</strong>
      <p>{children}</p>
      {note ? <span>{note}</span> : null}
    </div>
  );
}

export default function EvidenceDrawer({ dados }) {
  if (!dados) {
    return (
      <details className="evidence-drawer">
        <summary>Evidencias e campos extraidos</summary>
        <p className="empty-state">Ainda nao ha resumo IA estruturado para exibir evidencias.</p>
      </details>
    );
  }

  return (
    <details className="evidence-drawer" open>
      <summary>Evidencias usadas pela leitura</summary>
      {dados.objeto?.descricao ? (
        <EvidenceRow title="Objeto identificado" note={dados.objeto.trecho_fonte}>
          {dados.objeto.descricao}
        </EvidenceRow>
      ) : null}
      {dados.datas_relevantes?.slice(0, 4).map((item) => (
        <EvidenceRow key={`${item.tipo}-${item.data}-${item.descricao}`} title={item.tipo || 'Data relevante'} note={item.trecho_fonte}>
          {formatDate(item.data, 'Data nao identificada')} · {item.descricao}
        </EvidenceRow>
      ))}
      {dados.valores?.slice(0, 4).map((item) => (
        <EvidenceRow key={`${item.tipo}-${item.valor}-${item.descricao}`} title={item.tipo || 'Valor encontrado'} note={item.trecho_fonte}>
          {formatMoney(item.valor)} · {item.descricao}
        </EvidenceRow>
      ))}
      {dados.campos_nao_encontrados?.length ? (
        <EvidenceRow title="Campos nao encontrados">
          {dados.campos_nao_encontrados.join(', ')}
        </EvidenceRow>
      ) : null}
    </details>
  );
}
