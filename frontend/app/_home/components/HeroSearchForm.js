'use client';

import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import styles from '../styles.module.css';

// Client component so Enter-to-submit is explicit (router.push), nao so o
// comportamento implicito nativo do <form> -- achado ao investigar reclamacao
// de "a busca nao funciona direito": Enter no campo nem sempre disparava o
// submit nativo. requestSubmit() ainda funciona pro clique no botao.
export default function HeroSearchForm() {
  const router = useRouter();

  function handleSubmit(event) {
    event.preventDefault();
    const termo = new FormData(event.currentTarget).get('q');
    const q = String(termo || '').trim();
    if (q.length < 2) return;
    router.push(`/busca?q=${encodeURIComponent(q)}`);
  }

  return (
    <form onSubmit={handleSubmit} role="search" className={`${styles.heroSearch} hero-search`}>
      <Search size={20} className="hero-search-icon" />
      <input
        name="q"
        className="hero-search-input"
        placeholder="Buscar documento, empenho, credor…"
        aria-label="Buscar em documentos, empenhos e credores"
        minLength={2}
      />
      <button type="submit" className="hero-search-button">Procurar</button>
    </form>
  );
}
