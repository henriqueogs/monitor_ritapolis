import SectionBlock from '../../../components/SectionBlock';
import { formatMoney } from '../../../lib/format';
import styles from '../styles.module.css';

function statusLabel(value) {
  const labels = {
    forte: 'Correspondencia forte',
    sugerida: 'Sugerida',
    fraca: 'Baixa confianca',
    baixa_confianca: 'Baixa confianca',
    confirmada: 'Confirmada',
    rejeitada: 'Rejeitada',
    revisar: 'Revisar'
  };

  return labels[value] || value || 'Revisar';
}

function sourceLabel(value) {
  const labels = {
    pncp: 'PNCP'
  };

  return labels[value] || value || 'Fonte externa';
}

function scoreLabel(value) {
  if (value == null) return 'Sem score';
  return `${Math.round(Number(value))}/100`;
}

function compactText(value, fallback = 'Nao informado') {
  if (!value) return fallback;
  const text = String(value).replace(/\s+/g, ' ').trim();
  if (text.length <= 180) return text;
  return `${text.slice(0, 177).trim()}...`;
}

export default function LicitationRelatedSources({ fontes }) {
  const all = Array.isArray(fontes) ? fontes : [];
  const seen = new Set();
  const itens = all.filter((f) => {
    const key = f.identificador || f.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return (
    <SectionBlock
      title="Fontes complementares da licitacao"
      description="Correspondencias externas ficam como evidencia auxiliar ate revisao."
    >
      {itens.length ? (
        <div className={styles.externalSourceList}>
          {itens.map((item) => {
            const candidato = item.candidato_resumo || {};

            return (
              <article key={item.id} className={styles.externalSourceRow}>
                <div className={styles.externalSourceMain}>
                  <div className={styles.externalSourceMeta}>
                    <span>{sourceLabel(item.fonte)}</span>
                    <span>{statusLabel(item.status_correspondencia)}</span>
                    <span>Score {scoreLabel(item.score)}</span>
                  </div>
                  <h3>{item.identificador}</h3>
                  <p>{compactText(candidato.objeto || item.payload_json?.local?.objeto)}</p>
                  {item.correlacao?.alertas?.length ? (
                    <ul className={styles.correlacaoAlertas}>
                      {item.correlacao.alertas.map((alerta) => (
                        <li key={alerta}>{alerta}</li>
                      ))}
                    </ul>
                  ) : null}
                  {item.estrategia_busca ? (
                    <p className={styles.correlacaoMeta}>Busca: {item.estrategia_busca}</p>
                  ) : null}
                  <dl className={styles.externalSourceFacts}>
                    <div>
                      <dt>Processo</dt>
                      <dd>{candidato.processo || candidato.numero_compra || 'Nao informado'}</dd>
                    </div>
                    <div>
                      <dt>Modalidade</dt>
                      <dd>{candidato.modalidade || 'Nao informada'}</dd>
                    </div>
                    <div>
                      <dt>Valor PNCP</dt>
                      <dd>{formatMoney(candidato.valor_total_homologado ?? candidato.valor_total_estimado)}</dd>
                    </div>
                    <div>
                      <dt>Orgao</dt>
                      <dd>{candidato.orgao_nome || candidato.orgao_cnpj || 'Nao informado'}</dd>
                    </div>
                  </dl>
                </div>
                <div className={styles.externalSourceSide}>
                  {item.url ? (
                    <a href={item.url} target="_blank" rel="noopener noreferrer">
                      Abrir PNCP
                    </a>
                  ) : (
                    <span>Sem link</span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="empty-state">Nenhuma fonte complementar relacionada a esta licitacao.</p>
      )}
    </SectionBlock>
  );
}
