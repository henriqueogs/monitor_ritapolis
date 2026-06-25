import './globals.css';
import Link from 'next/link';
import TopNav from './components/TopNav';
import { DISCLAIMER_RODAPE } from './lib/disclaimer';

export const metadata = {
  title: 'Monitor Ritápolis — Inteligência Pública com IA',
  description:
    'Entenda documentos públicos em segundos. O Monitor Ritápolis usa IA para transformar editais, decretos e licitações em informações compreensíveis.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>
        <TopNav />
        <div className="app-shell">
          {children}
          <footer className="site-footer">
            <div className="site-footer-inner">
              <div className="footer-brand">
                <strong>Monitor Ritápolis</strong>
                <span>Transparência municipal com IA verificável</span>
              </div>
              <div className="footer-meta">
                <span>Dados coletados das fontes oficiais da Prefeitura e da Câmara</span>
                <span className="footer-dot">·</span>
                <Link href="/sobre">Sobre o projeto</Link>
              </div>
            </div>
            <p className="site-footer-disclaimer">{DISCLAIMER_RODAPE}</p>
          </footer>
        </div>
      </body>
    </html>
  );
}
