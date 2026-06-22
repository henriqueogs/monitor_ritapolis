import { fetchAdminStatus } from '../../lib/api';
import AdminJobsDashboard from './AdminJobsDashboard';

export default async function AdminJobsPage() {
  const data = await fetchAdminStatus().catch(() => null);
  return <AdminJobsDashboard initialData={data} />;
}
