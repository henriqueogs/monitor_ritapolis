import Link from 'next/link';

function cnpjLimpo(cnpj) {
  const c = String(cnpj || '').replace(/\D/g, '');
  return c.length === 14 ? c : null;
}

// Cruzamento com o credor: perfil direto quando há CNPJ; busca por nome quando
// só temos o nome (honesto — não fabrica um CNPJ que a fonte não deu).
export default function VencedorLink({ nome, cnpj }) {
  if (!nome) return null;
  const c = cnpjLimpo(cnpj);
  const href = c ? `/credores/${c}` : `/credores?busca=${encodeURIComponent(nome)}`;
  return <Link href={href}>{nome}</Link>;
}
