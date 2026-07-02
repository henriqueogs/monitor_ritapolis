import SectionBlock from '../../components/SectionBlock';
import { formatDate } from '../../lib/format';

const PORTAL_URL = 'https://pt.ritapolis.mg.gov.br/Tempo_Real_Despesa';

export default function StatusColeta({ logs }) {
  return (
    <SectionBlock
      title="Status da coleta"
      description="Dados coletados via API pública do Portal da Transparência (SH3 Informática). Atualização automática diária."
    >
      {!logs?.length && <p className="empty-state">Nenhum log de coleta disponível.</p>}
      {logs?.length > 0 && (
        <dl className="keyvalue-list">
          {logs.map((log) => (
            <div key={log.exercicio} className="keyvalue-row">
              <dt>Exercício {log.exercicio}</dt>
              <dd>
                <span
                  className={`availability-badge ${
                    log.status === 'ok' ? 'is-real' : log.status === 'erro_parcial' ? 'is-parcial' : 'is-pendente'
                  }`}
                >
                  {log.status === 'ok' ? 'Completo' : log.status === 'erro_parcial' ? `Parcial — ${log.erro}` : log.status}
                </span>
                <span style={{ marginLeft: 10, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  {log.registros?.toLocaleString('pt-BR')} registros · coletado em {formatDate(log.coletado_em)}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      )}
      <p style={{ marginTop: 16, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
        Fonte:{' '}
        <a href={PORTAL_URL} target="_blank" rel="noopener noreferrer">
          pt.ritapolis.mg.gov.br/Tempo_Real_Despesa
        </a>{' '}
        — Sistema SH3 Informática, API pública, sem autenticação.
      </p>
    </SectionBlock>
  );
}
