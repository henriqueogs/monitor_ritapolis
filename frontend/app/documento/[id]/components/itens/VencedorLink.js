import Link from 'next/link';

function cnpjLimpo(cnpj) {
  const c = String(cnpj || '').replace(/\D/g, '');
  return c.length === 14 ? c : null;
}

// Cruzamento com o credor: perfil direto quando há CNPJ; busca por nome quando
// só temos o nome (honesto — não fabrica um CNPJ que a fonte não deu).
// temPerfil === false: o CNPJ não tem empenho no município (perfil daria 404 e
// a busca viria vazia) — mostra só o nome. Ausente (API antiga) mantém o link.
export default function VencedorLink({ nome, cnpj, temPerfil }) {
  if (!nome) return null;
  if (temPerfil === false) return <span>{nome}</span>;
  const c = cnpjLimpo(cnpj);
  const href = c ? `/credores/${c}` : `/credores?busca=${encodeURIComponent(nome)}`;
  return <Link href={href}>{nome}</Link>;
}
