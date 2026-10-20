import PerguntarForm from './PerguntarForm';

export const metadata = {
  title: 'Perguntar aos documentos',
  description:
    'Faça uma pergunta e receba uma resposta com as fontes oficiais de Ritápolis/MG que a sustentam.',
  // Recurso em implantação gradual: fora dos buscadores até ser lançado de verdade.
  robots: { index: false, follow: false },
};

// Dinâmica de propósito: o CSP por nonce (proxy.js) só vale em HTML gerado por requisição; página
// estática não teria o nonce e os scripts seriam bloqueados em produção.
export const dynamic = 'force-dynamic';

export default function PerguntarPage() {
  return (
    <main className="page-container">
      <div className="page-hero">
        <h1>Perguntar aos documentos</h1>
        <p className="page-hero-sub">
          Pergunte em linguagem natural. A resposta só aparece quando existe documento oficial que a
          sustente, e sempre com o link da fonte.
        </p>
      </div>
      <PerguntarForm />
    </main>
  );
}
