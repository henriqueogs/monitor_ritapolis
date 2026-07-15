import { fetchAlertasStats, fetchAlertasConfig, fetchAlertasAdmin } from '../../lib/api';
import AdminAlertasPanel from './AdminAlertasPanel';

export default async function AdminAlertasPage() {
  const [stats, config, alertas] = await Promise.all([
    fetchAlertasStats().catch(() => ({ total: 0, critico: 0, atencao: 0, info: 0 })),
    fetchAlertasConfig().catch(() => []),
    fetchAlertasAdmin({ status: 'ativo', limite: 50 }).catch(() => ({ dados: [] })),
  ]);
  return <AdminAlertasPanel initialStats={stats} initialConfig={config} initialAlertas={alertas} />;
}
