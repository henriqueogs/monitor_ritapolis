'use client';

import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';

// Busca escopada por area (dinheiro publico x atos oficiais) -- manda pro
// /busca ja com `tipo` preenchido, pra nao misturar resultado de edital com
// decreto quando a pessoa ja entrou por um hub especifico. Client component
// por causa do Enter-to-submit explicito (mesma razao do HeroSearchForm que
// esse componente substitui na home).
export default function AreaSearchForm({ tipos, placeholder = 'Buscar…', className = '' }) {
  const router = useRouter();

  function handleSubmit(event) {
    event.preventDefault();
    const termo = new FormData(event.currentTarget).get('q');
    const q = String(termo || '').trim();
    if (q.length < 2) return;
    const params = new URLSearchParams({ q });
    if (tipos?.length) params.set('tipo', tipos.join(','));
    router.push(`/busca?${params.toString()}`);
  }

  return (
    <form onSubmit={handleSubmit} role="search" className={`hero-search ${className}`}>
      <Search size={20} className="hero-search-icon" />
      <input
        name="q"
        className="hero-search-input"
        placeholder={placeholder}
        aria-label={placeholder}
        minLength={2}
      />
      <button type="submit" className="hero-search-button">Procurar</button>
    </form>
  );
}
