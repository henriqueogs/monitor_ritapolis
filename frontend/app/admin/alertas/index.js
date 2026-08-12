import { fetchAlertasAdminStats, fetchAlertasConfig, fetchAlertasAdmin } from '../../lib/api';
import AdminAlertasPanel from './AdminAlertasPanel';

export default async function AdminAlertasPage() {
  const [stats, config, alertas] = await Promise.all([
    fetchAlertasAdminStats().catch(() => ({
      severidade: { total: 0, critico: 0, atencao: 0, info: 0 },
      editorial: { total: 0 },
    })),
    fetchAlertasConfig().catch(() => []),
    fetchAlertasAdmin({ status: 'ativo', limite: 100 }).catch(() => ({ dados: [] })),
  ]);
  return <AdminAlertasPanel initialStats={stats} initialConfig={config} initialAlertas={alertas} />;
}
