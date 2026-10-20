import Link from 'next/link';

function cnpjLimpo(cnpj) {
  const c = String(cnpj || '').replace(/\D/g, '');
  return c.length === 14 ? c : null;
}

// Cruzamento com o credor: perfil direto quando há CNPJ e o perfil existe;
// busca por nome quando só temos o nome (honesto — não fabrica um CNPJ que a
// fonte não deu) ou quando o vencedor não tem empenho no município
// (temPerfil === false, o perfil daria 404). Ausente (API antiga) mantém o perfil.
export default function VencedorLink({ nome, cnpj, temPerfil }) {
  if (!nome) return null;
  const c = temPerfil === false ? null : cnpjLimpo(cnpj);
  const href = c ? `/credores/${c}` : `/credores?busca=${encodeURIComponent(nome)}`;
  return <Link href={href}>{nome}</Link>;
}
