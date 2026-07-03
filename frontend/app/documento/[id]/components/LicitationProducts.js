import SectionBlock from '../../../components/SectionBlock';
import ItensSolicitados from './itens/ItensSolicitados';
import ResultadoLotes from './itens/ResultadoLotes';
import ResultadoGlobal from './itens/ResultadoGlobal';

/**
 * Seção "Itens do processo" em 3 blocos fiéis à fonte: demanda do edital,
 * resultado por lote (teto homologado) e resultado global — cada valor no
 * bloco da sua natureza real. Lixo de parser fica colapsado no rodapé.
 * Consome `produtos.estrutura` (read-model); fallback à lista plana se ausente.
 */
export default function LicitationProducts({ produtos, documento }) {
  const estrutura = produtos?.estrutura;

  if (!estrutura || (produtos?.dados || []).length === 0) {
    return (
      <SectionBlock title="Itens deste processo">
        <p className="empty-state">Nenhum item estruturado para este documento.</p>
      </SectionBlock>
    );
  }

  const { itens_solicitados, resultado_lotes, resultado_global, descartados, cobertura } = estrutura;
  const vazio = !itens_solicitados.length && !resultado_lotes.length && !resultado_global;

  return (
    <SectionBlock
      title="Itens deste processo"
      description="O que foi solicitado no edital e como ficou o resultado da licitação, direto das fontes oficiais."
    >
      {vazio ? (
        <p className="empty-state">Os itens deste processo ainda não têm preço ou fornecedor na fonte.</p>
      ) : null}

      {cobertura?.so_demanda ? (
        <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-muted)' }}>
          O resultado da licitação (vencedores e valores) ainda não foi publicado pela fonte — abaixo,
          apenas o que foi solicitado no edital.
        </p>
      ) : null}

      <ItensSolicitados itens={itens_solicitados} documento={documento} />
      <ResultadoLotes lotes={resultado_lotes} documento={documento} />
      <ResultadoGlobal global={resultado_global} documento={documento} />

      {descartados?.length ? (
        <details className="details-block" style={{ marginTop: 8 }}>
          <summary>
            {descartados.length} {descartados.length === 1 ? 'linha descartada' : 'linhas descartadas'} (ruído de leitura do PDF)
          </summary>
          <ul className="plain-list" style={{ marginTop: 12 }}>
            {descartados.map((d) => (
              <li key={d.id} style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {d.descricao} <span style={{ opacity: 0.6 }}>· {d.motivo}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </SectionBlock>
  );
}
