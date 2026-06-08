import { redirect } from 'next/navigation';

function buildRedirectPath(searchParams) {
  const params = new URLSearchParams();

  Object.entries(searchParams || {}).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item != null && item !== '') params.append(key, item);
      });
      return;
    }

    if (value != null && value !== '') params.set(key, value);
  });

  const query = params.toString();
  return query ? `/admin/cobertura?${query}` : '/admin/cobertura';
}

export default function CoberturaPage({ searchParams }) {
  redirect(buildRedirectPath(searchParams));
}
