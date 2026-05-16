import { syncPrefeituraOnPortalOpen } from '../../lib/api';

export default async function PrefeituraAutoSync() {
  await syncPrefeituraOnPortalOpen();
  return null;
}
