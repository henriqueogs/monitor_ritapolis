import './globals.css';
import TopNav from './components/TopNav';

export const metadata = {
  title: 'Monitor Ritápolis — Inteligência Pública com IA',
  description: 'Entenda documentos públicos em segundos. O Monitor Ritápolis usa IA para transformar editais, decretos e licitações em informações compreensíveis.'
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
              <span>Monitor Ritápolis</span>
              <span>Dados públicos coletados de fontes oficiais — <a href="/admin">Operação</a></span>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
