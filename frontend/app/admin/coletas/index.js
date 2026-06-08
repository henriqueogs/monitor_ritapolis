import CollectionUpdateAction from '../../components/CollectionUpdateAction';
import SectionBlock from '../../components/SectionBlock';
import StatusBadge from '../../components/StatusBadge';
import { fetchColetaAtualizacaoStatus, fetchColetas, fetchSchedulerStatus } from '../../lib/api';
import { formatDate, labelFonte } from '../../lib/format';

function SchedulerRow({ label, status }) {
  if (!status) return null;
  return (
    <div className="table-row table-row-stacked">
      <div>
        <strong>{label}</strong>
        <p>
          {status.enabled ? 'Habilitado' : 'Desabilitado'}
          {status.intervalo_horas ? ` · a cada ${status.intervalo_horas}h` : ''}
          {status.batch_size ? ` · lote de ${status.batch_size} docs` : ''}
        </p>
        {status.ultima_coleta && (
          <p>Última coleta: {formatDate(status.ultima_coleta)}</p>
        )}
        {status.proxima_coleta && status.proxima_em_minutos > 0 && (
          <p>Próxima em {status.proxima_em_minutos} min ({formatDate(status.proxima_coleta)})</p>
        )}
        {status.proxima_em_minutos === 0 && (
          <p>Coleta já está no prazo — ocorrerá no próximo tick.</p>
        )}
        {status.ultimo_ciclo && (
          <p>Último ciclo IA: {formatDate(status.ultimo_ciclo)}
            {status.ultimo_resultado?.enfileirado != null
              ? ` · ${status.ultimo_resultado.enfileirado} docs enfileirados`
              : ''}
          </p>
        )}
      </div>
      <StatusBadge value={status.running && status.enabled ? 'em_andamento' : status.enabled ? 'ok' : 'desabilitado'} />
    </div>
  );
}

export default async function AdminColetasPage() {
  const [data, statusAtualizacao, scheduler] = await Promise.all([
    fetchColetas({ limite: 50 }).catch(() => ({ dados: [] })),
    fetchColetaAtualizacaoStatus().catch(() => ({ status: 'idle', running: false })),
    fetchSchedulerStatus().catch(() => null)
  ]);

  return (
    <main className="page-container admin-page">
      <div className="page-title">
        <div>
          <h1>Coletas</h1>
          <p>Historico operacional e agendamento automatico das fontes coletadas.</p>
        </div>
      </div>

      <SectionBlock title="Atualizar coleta" description="Execute uma nova coleta manual da Prefeitura, da Camara ou das duas fontes.">
        <CollectionUpdateAction initialStatus={statusAtualizacao} />
      </SectionBlock>

      {scheduler && (
        <SectionBlock
          title="Schedulers automáticos"
          description="Tarefas que rodam em segundo plano enquanto o servidor está ativo. Configuráveis via variáveis de ambiente."
        >
          <div className="simple-table">
            <SchedulerRow label="Coleta automática" status={scheduler.coletas} />
            <SchedulerRow label="Resumos IA diários" status={scheduler.ia} />
          </div>
          <p style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
            Para ajustar: <code>COLLECTION_SCHEDULER_INTERVAL_HOURS</code>,{' '}
            <code>AI_SCHEDULER_BATCH_SIZE</code>, <code>AI_SCHEDULER_INTERVAL_MS</code>.
            Para desabilitar: <code>COLLECTION_SCHEDULER_ENABLED=false</code> ou{' '}
            <code>AI_SCHEDULER_ENABLED=false</code>.
          </p>
        </SectionBlock>
      )}

      <SectionBlock title="Historico recente">
        <div className="simple-table">
          {data.dados?.length ? (
            data.dados.map((coleta) => (
              <div key={coleta.id} className="table-row table-row-stacked">
                <div>
                  <strong>{coleta.fonte_nome || labelFonte(coleta.fonte)}</strong>
                  <p>Inicio {formatDate(coleta.inicio)} — fim {formatDate(coleta.fim)}</p>
                  <p>Novos {coleta.itens_novos} · atualizados {coleta.itens_atualizados} · erros {coleta.itens_com_erro}</p>
                </div>
                <StatusBadge value={coleta.status} />
              </div>
            ))
          ) : (
            <p className="empty-state">Nenhuma coleta registrada.</p>
          )}
        </div>
      </SectionBlock>
    </main>
  );
}
