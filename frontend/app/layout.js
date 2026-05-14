import './globals.css';
import TopNav from './components/TopNav';

export const metadata = {
  title: 'Monitor Ritapolis',
  description: 'Plataforma de inteligencia publica verificavel sobre dados da Prefeitura e da Camara de Ritapolis'
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
              <span>Monitor Ritapolis</span>
              <span>Dados publicos coletados de fontes oficiais · <a href="/admin">Operacao</a></span>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
