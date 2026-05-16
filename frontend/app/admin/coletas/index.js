import CollectionUpdateAction from '../../components/CollectionUpdateAction';
import SectionBlock from '../../components/SectionBlock';
import StatusBadge from '../../components/StatusBadge';
import { fetchColetaAtualizacaoStatus, fetchColetas } from '../../lib/api';
import { formatDate, labelFonte } from '../../lib/format';

export default async function AdminColetasPage() {
  const [data, statusAtualizacao] = await Promise.all([
    fetchColetas({ limite: 50 }).catch(() => ({ dados: [] })),
    fetchColetaAtualizacaoStatus().catch(() => ({ status: 'idle', running: false }))
  ]);

  return (
    <main className="page-container admin-page">
      <div className="page-title">
        <div>
          <h1>Coletas</h1>
          <p>Historico operacional das fontes coletadas.</p>
        </div>
      </div>

      <SectionBlock title="Atualizar coleta" description="Execute uma nova coleta manual da Prefeitura, da Camara ou das duas fontes.">
        <CollectionUpdateAction initialStatus={statusAtualizacao} />
      </SectionBlock>

      <SectionBlock title="Historico recente">
        <div className="simple-table">
          {data.dados?.length ? (
            data.dados.map((coleta) => (
              <div key={coleta.id} className="table-row table-row-stacked">
                <div>
                  <strong>{coleta.fonte_nome || labelFonte(coleta.fonte)}</strong>
                  <p>Inicio {formatDate(coleta.inicio)} - fim {formatDate(coleta.fim)}</p>
                  <p>Novos {coleta.itens_novos} - atualizados {coleta.itens_atualizados} - erros {coleta.itens_com_erro}</p>
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
