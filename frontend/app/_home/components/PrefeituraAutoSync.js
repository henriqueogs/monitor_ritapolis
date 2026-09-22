'use client';

import { useEffect } from 'react';
import { syncPrefeituraOnPortalOpen } from '../../lib/api';

// Client component de proposito: dispara a verificacao/coleta da Prefeitura
// sem bloquear o render da home (nenhum dado dele e usado na tela hoje).
export default function PrefeituraAutoSync() {
  useEffect(() => {
    syncPrefeituraOnPortalOpen().catch(() => null);
  }, []);

  return null;
}
