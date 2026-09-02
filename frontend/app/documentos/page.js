import DocumentosPage from './index';

// Redireciona preservando querystring (searchParams) -- estatico bakearia o
// redirect com params vazios do build e perderia o filtro de quem usa link
// antigo com query.
export const dynamic = 'force-dynamic';
export default DocumentosPage;
