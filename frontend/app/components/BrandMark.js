/**
 * Glifo da marca: perfil de Tiradentes + barras de dados — versão simplificada
 * da logo horizontal, legível em tamanhos pequenos (navbar, favicon, app-icon).
 * Herda a cor do contexto (currentColor), então funciona em fundo claro/escuro.
 */
export default function BrandMark({ size = 16, className }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="currentColor"
      className={className}
      role="img"
      aria-label="ritápolis.com"
    >
      <path d="M20 15c-4 2 -6 6 -6 11c0 3 -1 4 -3 6c-1 1 -1 2 1 2l3 0l0 4c0 5 3 9 8 10l0 -33c0 -6 -1 -11 -3 -11z" />
      <rect x="30" y="30" width="4" height="19" rx="1" />
      <rect x="37" y="22" width="4" height="27" rx="1" />
      <rect x="44" y="34" width="4" height="15" rx="1" />
    </svg>
  );
}
