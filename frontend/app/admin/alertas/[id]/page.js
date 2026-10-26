import { notFound } from 'next/navigation';
import { fetchAlertaAdmin } from '../../../lib/api';
import AlertaRevisao from './AlertaRevisao';

export const metadata = { title: 'Revisar descoberta — Admin' };

export default async function AdminAlertaDetalhePage(props) {
  const params = await props.params;
  const alerta = await fetchAlertaAdmin(params.id).catch(() => null);
  if (!alerta) {
    notFound();
  }
  return <AlertaRevisao alerta={alerta} />;
}
